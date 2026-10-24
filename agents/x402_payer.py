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

Spending counts only after a confirmed settlement: a receipt with a tx, or
-- when the outcome is unclear (timeout, lost reply, error) -- the chain
saying our authorization was used. Anything else releases the hold.

The signer is any x402 ClientEvmSigner: a CDP Server Wallet account in real
use (x402_wallet.signer_for), a throwaway local key in tests.
"""
import json
import logging
import threading
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import requests

import x402_chain
import x402_config

logger = logging.getLogger("x402-payer")


@dataclass
class PaidResult:
    ok: bool
    data: Any = None
    status: int | None = None
    paid: bool = False         # a payment was confirmed settled for this call
    usd: Any = None            # Decimal price, when one was asked
    tx: str | None = None
    tx_url: str | None = None
    payer: str | None = None
    reason: str | None = None  # why it failed / didn't pay
    steps: list = field(default_factory=list)  # what happened, for logs and the demo


class X402Payer:
    def __init__(self, cfg, signer, guard, timeout=None, session=None,
                 authorization_used=x402_chain.authorization_used,
                 find_tx=x402_chain.find_authorization_tx):
        from x402 import x402ClientSync
        from x402.http.clients import wrapRequestsWithPayment
        from x402.mechanisms.evm.exact import register_exact_evm_client

        x402_config.require_testnet(cfg)
        self.cfg = cfg
        self.guard = guard
        self.timeout = timeout or cfg.client_timeout_seconds
        self.address = signer.address
        self._authorization_used = authorization_used
        self._find_tx = find_tx
        client = x402ClientSync()
        register_exact_evm_client(client, signer, networks=cfg.network)
        client.set_spend_controls({"max_amount_per_payment": f"${cfg.max_per_call_usd}"})
        client.on_before_payment_creation(self._before_payment)
        client.on_after_payment_creation(self._after_payment)
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
        call.network = req.network
        call.step(f"402 Payment Required: ${usd} test USDC on {net['name']} to {req.pay_to}")
        hold, reason = self.guard.reserve(call.endpoint, usd, req.network)
        if hold is None:
            call.result.reason = reason
            call.step(f"not paying: {reason}")
            return AbortResult(reason=reason)
        call.hold = hold
        call.step(f"within caps (${self.guard.remaining_today()} left today if this settles); "
                  f"signing payment from {self.address}")
        return None

    def _after_payment(self, ctx):
        self._call.auth = x402_chain.authorization_of(ctx.payment_payload)

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
                if call.result.reason is None and call.hold is None:  # x402's own spend controls said no
                    reason = f"x402 spend controls refused: {e}"
                    self.guard.ledger.record_blocked(call.endpoint, None, reason)
                    call.result.reason = reason
                elif call.result.reason is None:  # signed, then the paid request itself failed
                    call.result.reason = f"the paid request failed: {e}"
                return self._finish(call, ok=False)
            except requests.RequestException as e:
                call.result.reason = f"couldn't reach {url}: {type(e).__name__}"
                return self._finish(call, ok=False)
            finally:
                self._call = None

            call.result.status = resp.status_code
            header = resp.headers.get("PAYMENT-RESPONSE")
            if header:
                receipt = decode_payment_response_header(header)
                if receipt.success:
                    call.settled = True
                    call.result.tx = receipt.transaction or None
                    call.result.tx_url = x402_config.tx_url(receipt.network, receipt.transaction)
                    call.result.payer = receipt.payer
                    call.step(f"settled: tx {receipt.transaction or '(confirmed on-chain by the server)'}")
            if resp.status_code != 200:
                call.result.reason = call.result.reason or _error_text(resp)
                return self._finish(call, ok=False)
            try:
                call.result.data = resp.json()
            except ValueError:
                call.result.reason = "server sent back something that isn't JSON"
                return self._finish(call, ok=False)
            call.step(f"HTTP 200: got the answer{' (paid)' if call.hold else ' (free)'}")
            return self._finish(call, ok=True)

    def _finish(self, call, ok):
        """Resolve the hold exactly once: spent only if settlement is confirmed."""
        call.result.ok = ok
        if call.hold is None:
            return call.result
        if not call.settled:
            self._check_chain(call)
        if call.settled:
            self.guard.confirm(call.hold, tx=call.result.tx)
            call.result.paid = True
        else:
            self.guard.release(call.hold, call.result.reason)
            call.step(f"not counted against the cap: {call.result.reason}")
        call.hold = None
        return call.result

    def _check_chain(self, call):
        """The reply didn't confirm settlement. Ask the chain whether our
        authorization was used anyway, so we never miss real spending."""
        if not call.auth or not self.cfg.rpc_url:
            return
        authorizer, nonce, _ = call.auth
        used = self._authorization_used(self.cfg.rpc_url, self.cfg.usdc, authorizer, nonce)
        if used:
            tx = self._find_tx(self.cfg.rpc_url, self.cfg.usdc, authorizer, nonce)
            call.settled = True
            call.result.tx = tx
            call.result.tx_url = x402_config.tx_url(call.network, tx)
            call.step(f"on-chain check: the payment DID settle (tx {tx or 'not found yet'}), "
                      "but no answer came back")
            logger.warning(f"{call.endpoint}: paid on-chain (tx {tx}) without an answer: {call.result.reason}")
        elif used is False:
            call.step("on-chain check: payment not used, so nothing was charged")
        else:
            call.step("on-chain check: couldn't reach the chain; not counting it")
            logger.warning(f"{call.endpoint}: couldn't confirm on-chain whether the payment was used")


def _error_text(resp):
    """The server's JSON error message if it sent one, else the raw text."""
    try:
        body = resp.json()
    except ValueError:
        return f"HTTP {resp.status_code}: {resp.text[:200]}"
    if isinstance(body, dict) and body.get("message"):
        return f"HTTP {resp.status_code} {body.get('error')}: {body['message']}"
    return f"HTTP {resp.status_code}: {json.dumps(body)[:200]}"


class _Call:
    """State for one post(): which endpoint, the hold, what happened."""

    def __init__(self, endpoint):
        self.endpoint = endpoint
        self.hold = None
        self.auth = None
        self.network = None
        self.settled = False
        self.result = PaidResult(ok=False)

    def step(self, text):
        self.result.steps.append(text)
        logger.info(text)
