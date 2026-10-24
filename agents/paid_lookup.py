"""Merchant Resolver's paid lookup: when it's unsure about a store
(confidence < 0.6, needs_paid_lookup), it pays our x402 /x402/merchant-data
endpoint for a better category -- test USDC, within the hard caps.

Every failure keeps the free answer: x402 off, over the cap, server down,
store not found, or a paid answer that isn't more confident. Each paid
answer is cached per store for this run, so the same store is never paid
for twice. No uagents import here, so it's directly testable; the agent
calls improve() from a worker thread (it does blocking HTTP).
"""
import logging
import threading
import time

import merchant_resolver

logger = logging.getLogger("paid-lookup")

PAYER_RETRY_SECONDS = 60


class PaidMerchantLookup:
    def __init__(self, server_url, payer_factory):
        self.url = f"{server_url}/x402/merchant-data"
        self._payer_factory = payer_factory
        self._payer = None
        self._payer_failed_at = None
        self._cache = {}
        self._lock = threading.Lock()

    def _get_payer(self):
        """The payer is built lazily (it asks CDP for the wallet account). A
        failure is retried after PAYER_RETRY_SECONDS, not on every lookup."""
        with self._lock:
            if self._payer is not None:
                return self._payer
            if self._payer_failed_at and time.monotonic() - self._payer_failed_at < PAYER_RETRY_SECONDS:
                return None
            try:
                self._payer = self._payer_factory()
                logger.info(f"x402 payer ready: {self._payer.address}")
            except Exception as e:
                self._payer_failed_at = time.monotonic()
                logger.warning(f"x402 payer unavailable ({type(e).__name__}: {e}); using free answers")
            return self._payer

    def warm_up(self):
        self._get_payer()

    def improve(self, merchant, result):
        """(result, why): the paid answer if it's better, else the free one."""
        key = merchant_resolver.normalize(merchant)
        if key in self._cache:
            cached = self._cache[key]
            return (cached, "cached paid lookup") if cached else (result, "paid lookup already tried")

        payer = self._get_payer()
        if payer is None:
            return result, "x402 payer unavailable; kept the free answer"

        paid = payer.post(self.url, {"merchant": merchant})
        if not paid.ok:
            # Not cached: the cap resets tomorrow, and the server may come back.
            return result, f"didn't pay or failed ({paid.reason}); kept the free answer"
        data = paid.data or {}
        receipt = f"paid ${paid.usd} test USDC via x402, tx {paid.tx}"
        if not data.get("found") or not data.get("mcc"):
            self._cache[key] = None
            return result, f"{receipt}; paid lookup didn't know {merchant!r}, kept the free answer"
        confidence = float(data.get("confidence") or 0)
        if confidence <= result["confidence"]:
            self._cache[key] = None
            return result, f"{receipt}; paid answer wasn't more confident, kept the free answer"

        improved = merchant_resolver.from_paid_lookup(
            data.get("merchant") or merchant, data["mcc"], confidence,
            how=f"found with a paid x402 lookup (${paid.usd} test USDC, {data.get('source', 'paid data')})")
        self._cache[key] = improved
        return improved, f"{receipt}; {merchant!r} -> {improved['category']} {improved['mcc']} ({confidence:.2f})"


def build(cfg):
    """A PaidMerchantLookup paying from the CDP buyer account, or None when
    x402 is off. Imports CDP/x402 only when on."""
    if not cfg.enabled:
        return None

    def payer_factory():
        import x402_config
        import x402_wallet
        from x402_ledger import Ledger, SpendGuard
        from x402_payer import X402Payer

        guard = SpendGuard(Ledger(cfg.ledger_dir), cfg.daily_cap_usd, cfg.max_per_call_usd)
        return X402Payer(cfg, x402_wallet.signer_for(x402_config.BUYER_ACCOUNT), guard)

    return PaidMerchantLookup(cfg.server_url, payer_factory)
