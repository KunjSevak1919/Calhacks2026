"""Offline stand-ins for x402 tests: a facilitator that approves and
"settles" without a blockchain, a throwaway local key as the payer, and a
helper that serves an app on a real local socket (so tests exercise the
real HTTP 402 -> pay -> retry flow, x402 middleware and requests adapter)."""
import threading
from contextlib import contextmanager

import httpx
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


class FakeChain:
    """Stands in for the USDC contract: which authorization nonces are spent."""

    def __init__(self, reachable=True):
        self.spent = {}  # nonce -> tx
        self.reachable = reachable

    def authorization_used(self, rpc_url, usdc, authorizer, nonce):
        return (nonce in self.spent) if self.reachable else None

    def find_tx(self, rpc_url, usdc, authorizer, nonce):
        return self.spent.get(nonce)


class FakeFacilitator:
    """Approves and settles without a blockchain. settle_outcomes scripts
    each settle call in turn: "ok", "fail" (success=false, like the live
    invalid_exact_evm_transaction_failed), "raise" (timeout), or
    "landed-but-failed" (money moved, but the reply says failure)."""

    def __init__(self, network="eip155:84532", settle_outcomes=None, chain=None, valid=True):
        self.network = network
        self.verified = []
        self.settled = []
        self.settle_calls = 0
        self.settle_outcomes = list(settle_outcomes or [])
        self.chain = chain
        self.valid = valid

    def get_supported(self):
        return SupportedResponse(kinds=[SupportedKind(x402_version=2, scheme="exact", network=self.network)])

    def verify(self, payload, requirements):
        self.verified.append(payload)
        if not self.valid:
            return VerifyResponse(is_valid=False, invalid_reason="insufficient_funds",
                                  payer=payload.payload["authorization"]["from"])
        return VerifyResponse(is_valid=True, payer=payload.payload["authorization"]["from"])

    def settle(self, payload, requirements):
        self.settle_calls += 1
        outcome = self.settle_outcomes.pop(0) if self.settle_outcomes else "ok"
        payer = payload.payload["authorization"]["from"]
        nonce = payload.payload["authorization"]["nonce"]
        if outcome == "raise":
            raise httpx.ReadTimeout("timed out")
        if outcome in ("ok", "landed-but-failed") and self.chain is not None:
            self.chain.spent[nonce] = FAKE_TX
        if outcome in ("fail", "landed-but-failed"):
            return SettleResponse(success=False, error_reason="invalid_exact_evm_transaction_failed",
                                  error_message="Missing or invalid parameters (eth_sendRawTransaction)",
                                  transaction="", network=requirements.network, payer=payer)
        self.settled.append(payload)
        return SettleResponse(success=True, transaction=FAKE_TX, network=requirements.network,
                              payer=payer, amount=requirements.amount)


def resilient(fac, chain):
    """The server's facilitator wrapper with a fake chain and no retry delay."""
    from x402_facilitator import ResilientFacilitator
    return ResilientFacilitator(fac, "http://fake-rpc", x402_config.TESTNETS["eip155:84532"]["usdc"],
                                retry_delay=0, authorization_used=chain.authorization_used,
                                find_tx=chain.find_tx)


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
