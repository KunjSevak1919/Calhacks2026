from decimal import Decimal

import pytest

import x402_config
import x402_server
from tests.x402_fakes import FAKE_TX, SELLER, FakeFacilitator, config, local_signer, serve
from x402_ledger import Ledger, SpendGuard
from x402_payer import X402Payer


def pick(**kwargs):
    return {"best": {"name": "Aurum Gold"}, "ranked": [], "reason": "r",
            "store": {"mcc": "5411", "category": "grocery"}}


def make(tmp_path, cap="0.05", per_call="0.01", price="0.001"):
    cfg = config(tmp_path, x402_daily_cap_usd=cap, x402_max_per_call_usd=per_call,
                 x402_price_merchant_data_usd=price, x402_price_best_card_usd=price)
    seller_ledger = Ledger(str(tmp_path / "seller"))
    fac = FakeFacilitator()
    app = x402_server.create_app(cfg, fac, SELLER, seller_ledger, pick=pick)
    ledger = Ledger(str(tmp_path / "buyer"))
    payer = X402Payer(cfg, local_signer(), SpendGuard(ledger, cfg.daily_cap_usd, cfg.max_per_call_usd))
    return app, payer, ledger, fac


def test_pays_and_logs_amount_and_tx(tmp_path):
    app, payer, ledger, fac = make(tmp_path)
    with serve(app) as url:
        res = payer.post(f"{url}/x402/merchant-data", {"merchant": "Sakura Ramen"})
    assert res.ok and res.paid
    assert res.data["mcc"] == "5812"
    assert res.usd == Decimal("0.001")
    assert res.tx == FAKE_TX
    assert res.tx_url == f"https://sepolia.basescan.org/tx/{FAKE_TX}"
    assert any("402 Payment Required" in s for s in res.steps)
    t = ledger.totals()
    assert t["spent_usd"] == Decimal("0.001") and t["last_spent_tx"] == FAKE_TX
    assert len(fac.settled) == 1


def test_daily_cap_blocks_payment_and_nothing_is_signed(tmp_path):
    app, payer, ledger, fac = make(tmp_path, cap="0.002")
    with serve(app) as url:
        assert payer.post(f"{url}/x402/merchant-data", {"merchant": "Sakura Ramen"}).ok
        assert payer.post(f"{url}/x402/merchant-data", {"merchant": "Night Owl"}).ok
        res = payer.post(f"{url}/x402/merchant-data", {"merchant": "Pixel Hub"})
    assert not res.ok and not res.paid
    assert "over daily cap" in res.reason
    assert len(fac.verified) == 2  # the third never reached the facilitator
    assert ledger.totals()["blocked_count"] == 1
    assert ledger.signed_today_usd() == Decimal("0.002")


def test_per_call_max_blocks_expensive_endpoint(tmp_path):
    app, payer, ledger, fac = make(tmp_path, per_call="0.001", price="0.005")
    with serve(app) as url:
        res = payer.post(f"{url}/x402/merchant-data", {"merchant": "Sakura Ramen"})
    assert not res.ok and not res.paid
    assert "spend controls" in res.reason or "per-call max" in res.reason
    assert fac.verified == []
    assert ledger.totals()["blocked_count"] == 1
    assert ledger.signed_today_usd() == 0


def test_rejected_request_is_counted_but_not_settled(tmp_path):
    app, payer, ledger, fac = make(tmp_path)
    with serve(app) as url:
        res = payer.post(f"{url}/x402/merchant-data", {"merchant": ""})
    assert not res.ok and res.status == 400
    assert fac.settled == []
    t = ledger.totals()
    assert t["spent_usd"] == 0                      # nothing settled
    assert t["signed_today_usd"] == Decimal("0.001")  # but it counted against the cap


def test_unreachable_server_is_a_clean_failure(tmp_path):
    _, payer, _, _ = make(tmp_path)
    res = payer.post("http://127.0.0.1:9/x402/merchant-data", {"merchant": "x"})
    assert not res.ok and "couldn't reach" in res.reason


def test_payer_refuses_mainnet_config(tmp_path):
    cfg = config(tmp_path, x402_network="eip155:8453")
    with pytest.raises(x402_config.X402ConfigError):
        X402Payer(cfg, local_signer(), SpendGuard(Ledger(str(tmp_path)), "1", "1"))
