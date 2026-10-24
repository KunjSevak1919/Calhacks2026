"""A careful wrapper around the x402 facilitator client, for x402_server.py.

x402's middleware turns any failed settle into a bare "402 {}" and logs
nothing about why. This wrapper (same verify/settle/get_supported interface,
so the middleware can't tell the difference):

  - logs every verify/settle with its duration and the facilitator's exact
    error (errorReason + errorMessage, or the HTTP/transport exception)
  - never raises from settle: an exception becomes success=False with the
    real reason, so the client gets a clear error, not a stack trace
  - retries settle once (after SETTLE_RETRY_DELAY_SECONDS). Safe: the
    payment is an EIP-3009 authorization with a one-time nonce, so it can
    move money at most once no matter how often it's submitted
  - before calling a payment failed, asks the chain whether the
    authorization was spent anyway (e.g. settled, but the reply was lost).
    If so, it's a success -- with the tx -- so the payer gets the answer.
  - remembers what the chain said per nonce (chain_status), so the server
    can tell the client "you were not charged" only when that's confirmed.

Seen live (slow-Wi-Fi repro, 2026-10-24): verify OK, then settle answered
success=false, errorReason "invalid_exact_evm_transaction_failed" (the
facilitator's own eth_sendRawTransaction to sepolia.base.org was rejected);
the same payment flow succeeded on the next tries.
"""
import logging
import time

import x402_chain

logger = logging.getLogger("x402-server")

SETTLE_RETRY_DELAY_SECONDS = 2.0


class ResilientFacilitator:
    def __init__(self, inner, rpc_url, usdc, retry_delay=SETTLE_RETRY_DELAY_SECONDS,
                 authorization_used=x402_chain.authorization_used,
                 find_tx=x402_chain.find_authorization_tx):
        self.inner = inner
        self.rpc_url = rpc_url
        self.usdc = usdc
        self.retry_delay = retry_delay
        self._authorization_used = authorization_used
        self._find_tx = find_tx
        self.chain_status = {}  # nonce -> True (spent) / False (not spent) / None (unknown)

    def get_supported(self):
        return self.inner.get_supported()

    def verify(self, payload, requirements):
        started = time.monotonic()
        try:
            result = self.inner.verify(payload, requirements)
        except Exception as e:
            logger.error(f"facilitator verify FAILED after {time.monotonic() - started:.1f}s: "
                         f"{type(e).__name__}: {e}")
            raise
        took = time.monotonic() - started
        if result.is_valid:
            logger.info(f"facilitator verify ok in {took:.1f}s (payer {result.payer})")
        else:
            logger.warning(f"facilitator verify REJECTED in {took:.1f}s: {result.invalid_reason}: "
                           f"{result.invalid_message}")
        return result

    def settle(self, payload, requirements):
        from x402.schemas import SettleResponse

        auth = x402_chain.authorization_of(payload)
        payer = auth[0] if auth else None
        last = None
        for attempt in (1, 2):
            last = self._settle_once(payload, requirements, attempt)
            if last.success:
                return last
            spent = self._spent_on_chain(auth, requirements, last)
            if spent:
                return spent
            if attempt == 1:
                logger.info(f"retrying settle once in {self.retry_delay:.0f}s")
                time.sleep(self.retry_delay)
        logger.error(f"settle gave up after 2 attempts: {last.error_reason}: {last.error_message}; "
                     f"{self._charged_text(auth)}")
        return SettleResponse(success=False, error_reason=last.error_reason, error_message=last.error_message,
                              transaction=last.transaction or "", network=requirements.network, payer=payer)

    def _settle_once(self, payload, requirements, attempt):
        from x402.schemas import SettleResponse

        started = time.monotonic()
        try:
            result = self.inner.settle(payload, requirements)
        except Exception as e:
            took = time.monotonic() - started
            logger.error(f"facilitator settle attempt {attempt} FAILED after {took:.1f}s: {type(e).__name__}: {e}")
            return SettleResponse(success=False, error_reason="facilitator_unreachable",
                                  error_message=f"{type(e).__name__}: {e}"[:500], transaction="",
                                  network=requirements.network)
        took = time.monotonic() - started
        if result.success:
            logger.info(f"facilitator settle ok in {took:.1f}s (attempt {attempt}): tx {result.transaction}")
        else:
            logger.error(f"facilitator settle attempt {attempt} returned failure in {took:.1f}s: "
                         f"{result.error_reason}: {result.error_message}")
        return result

    def _spent_on_chain(self, auth, requirements, failed):
        """A success SettleResponse if the chain says this authorization was
        spent despite the failed settle; else None. Records what it saw."""
        from x402.schemas import SettleResponse

        if not auth or not self.rpc_url:
            return None
        authorizer, nonce, _ = auth
        used = self._authorization_used(self.rpc_url, self.usdc, authorizer, nonce)
        self.chain_status[nonce] = used
        if not used:
            return None
        tx = failed.transaction or self._find_tx(self.rpc_url, self.usdc, authorizer, nonce) or ""
        logger.warning(f"settle reported failure, but the payment IS on-chain (tx {tx or 'not found yet'}); "
                       "treating it as settled so the payer gets the answer")
        return SettleResponse(success=True, transaction=tx, network=requirements.network,
                              payer=authorizer, amount=requirements.amount)

    def _charged_text(self, auth):
        if not auth:
            return "couldn't read the authorization"
        status = self.chain_status.get(auth[1])
        if status is False:
            return "on-chain check: NOT charged"
        return "on-chain check: unknown (RPC unreachable)"
