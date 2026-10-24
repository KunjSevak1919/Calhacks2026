"""How our agents PAY for things over x402. Test network only.

X402Payer.post(url, body) does one HTTP POST. If the server answers 402, it
checks the price against the hard caps, signs a test-USDC payment, retries,
and returns the answer with the facilitator's receipt (tx hash). It never
raises: every failure comes back as PaidResult(ok=False, reason=...), so the
caller can fall back to its free path.

Before anything is signed (on_before_payment_creation hook):
  - the network must be a known testnet and the token must be its test USDC
  - SpendGuard.reserve() must allow the price (per-call max + daily cap)
x402's own spend_controls also caps every payment at X402_MAX_PER_CALL_USD
and only allows its known default assets, as a second layer.

The signer is any x402 ClientEvmSigner: a CDP Server Wallet account in real
use (x402_wallet.signer_for), a throwaway local key in tests.
"""
import logging
import threading
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import requests

import x402_config

logger = logging.getLogger("x402-payer")

DEFAULT_TIMEOUT_SECONDS = 8


@dataclass
class PaidResult:
    ok: bool
    data: Any = None
    status: int | None = None
    paid: bool = False         # a payment was signed for this call
    usd: Any = None            # Decimal price, when one was asked
    tx: str | None = None
    tx_url: str | None = None
    payer: str | None = None
    reason: str | None = None  # why it failed / didn't pay
    steps: list = field(default_factory=list)  # what happened, for logs and the demo


class X402Payer:
    def __init__(self, cfg, signer, guard, timeout=DEFAULT_TIMEOUT_SECONDS, session=None):
        from x402 import x402ClientSync
        from x402.http.clients import wrapRequestsWithPayment
        from x402.mechanisms.evm.exact import register_exact_evm_client

        x402_config.require_testnet(cfg)
        self.cfg = cfg
        self.guard = guard
        self.timeout = timeout
        self.address = signer.address
        client = x402ClientSync()
        register_exact_evm_client(client, signer, networks=cfg.network)
        client.set_spend_controls({"max_amount_per_payment": f"${cfg.max_per_call_usd}"})
        client.on_before_payment_creation(self._before_payment)
        self._session = wrapRequestsWithPayment(session or requests.Session(), client)
        self._lock = threading.Lock()
        self._call = None

    def _before_payment(self, ctx):
        from x402.schemas import AbortResult

        call = self._call
        req = ctx.selected_requirements
        net = x402_config.TESTNETS.get(req.network)
        if net is None:
            return self._refuse(call, None, f"refusing to pay on {req.network}: not a test network")
        if req.asset.lower() != net["usdc"].lower():
            return self._refuse(call, None, f"refusing to pay in token {req.asset}: not {net['name']} test USDC")
        usd = x402_config.atomic_to_usd(req.amount, req.network)
        call.result.usd = usd
        call.step(f"402 Payment Required: ${usd} test USDC on {net['name']} to {req.pay_to}")
        pid, reason = self.guard.reserve(call.endpoint, usd, req.network)
        if pid is None:
            call.result.reason = reason
            call.step(f"not paying: {reason}")
            return AbortResult(reason=reason)
        call.payment_id = pid
        call.result.paid = True
        call.step(f"within caps (${self.guard.remaining_today()} left today after this); "
                  f"signing payment from {self.address}")
        return None

    def _refuse(self, call, usd, reason):
        from x402.schemas import AbortResult

        self.guard.ledger.record_blocked(call.endpoint, usd, reason)
        call.result.reason = reason
        call.step(f"not paying: {reason}")
        return AbortResult(reason=reason)

    def post(self, url, body):
        # Not x402.http.clients.PaymentError: that name is the httpx client's
        # class, and the requests adapter raises its own.
        from x402.http.clients.requests import PaymentError
        from x402.http.utils import decode_payment_response_header

        with self._lock:
            call = self._call = _Call(urlparse(url).path)
            try:
                resp = self._session.post(url, json=body, timeout=self.timeout)
            except PaymentError as e:
                if call.result.reason is None:  # x402's own spend controls said no
                    reason = f"x402 spend controls refused: {e}"
                    self.guard.ledger.record_blocked(call.endpoint, None, reason)
                    call.result.reason = reason
                return call.finish(self.guard.ledger, ok=False)
            except requests.RequestException as e:
                call.result.reason = f"couldn't reach {url}: {type(e).__name__}"
                return call.finish(self.guard.ledger, ok=False)
            finally:
                self._call = None

            call.result.status = resp.status_code
            header = resp.headers.get("PAYMENT-RESPONSE")
            if header:
                receipt = decode_payment_response_header(header)
                if receipt.success:
                    call.result.tx = receipt.transaction
                    call.result.tx_url = x402_config.tx_url(receipt.network, receipt.transaction)
                    call.result.payer = receipt.payer
                    call.step(f"settled: tx {receipt.transaction}")
            if resp.status_code != 200:
                call.result.reason = call.result.reason or f"HTTP {resp.status_code}: {resp.text[:200]}"
                return call.finish(self.guard.ledger, ok=False)
            try:
                call.result.data = resp.json()
            except ValueError:
                call.result.reason = "server sent back something that isn't JSON"
                return call.finish(self.guard.ledger, ok=False)
            call.step(f"HTTP 200: got the answer{' (paid)' if call.result.paid else ' (free)'}")
            return call.finish(self.guard.ledger, ok=True)


class _Call:
    """State for one post(): which endpoint, whether we signed, what happened."""

    def __init__(self, endpoint):
        self.endpoint = endpoint
        self.payment_id = None
        self.result = PaidResult(ok=False)

    def step(self, text):
        self.result.steps.append(text)
        logger.info(text)

    def finish(self, ledger, ok):
        self.result.ok = ok
        if self.payment_id:
            ledger.record_result(self.payment_id, settled=bool(self.result.tx), tx=self.result.tx,
                                 error=None if ok else self.result.reason)
        return self.result
