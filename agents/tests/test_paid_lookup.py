from decimal import Decimal

import merchant_resolver
import paid_lookup
import x402_server
from tests.x402_fakes import SELLER, FakeFacilitator, config, local_signer, serve
from x402_ledger import Ledger, SpendGuard
from x402_payer import PaidResult, X402Payer

UNKNOWN = "Sakura Ramen House"


def free_result(name=UNKNOWN):
    result, needs = merchant_resolver.resolve_store(merchant=name)
    assert needs is True
    return result


class FakePayer:
    address = "0xbuyer"

    def __init__(self, result):
        self.result = result
        self.calls = []

    def post(self, url, body):
        self.calls.append((url, body))
        return self.result


def paid(data):
    return PaidResult(ok=True, data=data, paid=True, usd=Decimal("0.001"), tx="0xtx")


SAKURA = {"found": True, "merchant": "Sakura Ramen House", "mcc": "5812", "confidence": 0.85,
          "simulated": True, "source": "simulated merchant directory (demo data)"}


def test_unsure_store_is_upgraded_by_the_paid_answer():
    payer = FakePayer(paid(SAKURA))
    lookup = paid_lookup.PaidMerchantLookup("http://x402", lambda: payer)
    result, why = lookup.improve(UNKNOWN, free_result())
    assert result["category"] == "dining" and result["mcc"] == "5812"
    assert result["confidence"] == 0.85 and result["source"] == "paid_lookup_x402"
    assert "paid x402 lookup" in result["note"] and "simulated" in result["note"]
    assert "0xtx" in why
    assert payer.calls == [("http://x402/x402/merchant-data", {"merchant": UNKNOWN})]


def test_same_store_is_only_paid_for_once():
    payer = FakePayer(paid(SAKURA))
    lookup = paid_lookup.PaidMerchantLookup("http://x402", lambda: payer)
    lookup.improve(UNKNOWN, free_result())
    result, why = lookup.improve("sakura ramen house", free_result())
    assert result["mcc"] == "5812" and why == "cached paid lookup"
    assert len(payer.calls) == 1


def test_cap_hit_keeps_the_free_answer():
    blocked = PaidResult(ok=False, reason="over daily cap: spent $0.05 of $0.05 today")
    lookup = paid_lookup.PaidMerchantLookup("http://x402", lambda: FakePayer(blocked))
    free = free_result()
    result, why = lookup.improve(UNKNOWN, free)
    assert result is free
    assert "over daily cap" in why and "kept the free answer" in why


def test_not_found_keeps_free_answer_and_is_not_paid_again():
    payer = FakePayer(paid({"found": False, "simulated": True}))
    lookup = paid_lookup.PaidMerchantLookup("http://x402", lambda: payer)
    free = free_result("Zzyzx Emporium")
    assert lookup.improve("Zzyzx Emporium", free)[0] is free
    assert lookup.improve("Zzyzx Emporium", free)[0] is free
    assert len(payer.calls) == 1


def test_payer_that_cant_start_keeps_free_answer():
    def broken():
        raise RuntimeError("CDP unreachable")
    lookup = paid_lookup.PaidMerchantLookup("http://x402", broken)
    free = free_result()
    result, why = lookup.improve(UNKNOWN, free)
    assert result is free and "unavailable" in why


def test_build_returns_none_when_x402_is_off(tmp_path):
    assert paid_lookup.build(config(tmp_path, x402_enabled="off")) is None


def test_end_to_end_cap_hit_falls_back_to_free_answer(tmp_path):
    """Real payer + real x402 server (fake facilitator): first lookup pays,
    second store is over the cap, so the resolver keeps its free answer."""
    cfg = config(tmp_path, x402_daily_cap_usd="0.001")
    app = x402_server.create_app(cfg, FakeFacilitator(), SELLER, Ledger(str(tmp_path / "seller")),
                                 pick=lambda **k: {})
    ledger = Ledger(str(tmp_path / "buyer"))
    with serve(app) as url:
        payer = X402Payer(cfg, local_signer(), SpendGuard(ledger, cfg.daily_cap_usd, cfg.max_per_call_usd))
        lookup = paid_lookup.PaidMerchantLookup(url, lambda: payer)
        first, _ = lookup.improve(UNKNOWN, free_result())
        free = free_result("Night Owl Tacos")
        second, why = lookup.improve("Night Owl Tacos", free)
    assert first["source"] == "paid_lookup_x402"
    assert second is free and "over daily cap" in why
    t = ledger.totals()
    assert t["spent_count"] == 1 and t["blocked_count"] == 1
