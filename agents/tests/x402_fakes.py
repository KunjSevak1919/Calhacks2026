"""Offline stand-ins for x402 tests: a facilitator that approves and
"settles" without a blockchain, a throwaway local key as the payer, and a
helper that serves an app on a real local socket (so tests exercise the
real HTTP 402 -> pay -> retry flow, x402 middleware and requests adapter)."""
import threading
from contextlib import contextmanager

from eth_account import Account
from werkzeug.serving import make_server
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.schemas import SettleResponse, SupportedKind, SupportedResponse, VerifyResponse

import x402_config

FAKE_TX = "0x" + "ab" * 32
SELLER = "0x" + "11" * 20
KEYS = {"CDP_API_KEY_ID": "id", "CDP_API_KEY_SECRET": "secret", "CDP_WALLET_SECRET": "wallet"}


def config(tmp_path, **overrides):
    env = {**KEYS, "X402_LEDGER_DIR": str(tmp_path)}
    env.update({k.upper(): str(v) for k, v in overrides.items()})
    return x402_config.load(env)


class FakeFacilitator:
    def __init__(self, network="eip155:84532"):
        self.network = network
        self.verified = []
        self.settled = []

    def get_supported(self):
        return SupportedResponse(kinds=[SupportedKind(x402_version=2, scheme="exact", network=self.network)])

    def verify(self, payload, requirements):
        self.verified.append(payload)
        return VerifyResponse(is_valid=True, payer=payload.payload["authorization"]["from"])

    def settle(self, payload, requirements):
        self.settled.append(payload)
        return SettleResponse(success=True, transaction=FAKE_TX, network=requirements.network,
                              payer=payload.payload["authorization"]["from"], amount=requirements.amount)


def local_signer():
    return EthAccountSigner(Account.create())


@contextmanager
def serve(app):
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
