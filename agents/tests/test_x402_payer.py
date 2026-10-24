import time
from decimal import Decimal

import pytest

import x402_config
import x402_server
from tests.x402_fakes import (FAKE_TX, SELLER, FakeChain, FakeFacilitator, config, local_signer, resilient,
                              serve)
from x402_ledger import Ledger, SpendGuard
from x402_payer import X402Payer


def pick(**kwargs):
    return {"best": {"name": "Aurum Gold"}, "ranked": [], "reason": "r",
            "store": {"mcc": "5411", "category": "grocery"}}


def make(tmp_path, cap="0.05", per_call="0.01", price="0.001", settle_outcomes=None, valid=True,
         chain=None, pick_fn=pick, timeout=None):
    cfg = config(tmp_path, x402_daily_cap_usd=cap, x402_max_per_call_usd=per_call,
                 x402_price_merchant_data_usd=price, x402_price_best_card_usd=price)
    chain = chain or FakeChain()
    fac = FakeFacilitator(settle_outcomes=settle_outcomes, chain=chain, valid=valid)
    app = x402_server.create_app(cfg, resilient(fac, chain), SELLER, Ledger(str(tmp_path / "seller")),
                                 pick=pick_fn)
    ledger = Ledger(str(tmp_path / "buyer"))
    payer = X402Payer(cfg, local_signer(), SpendGuard(ledger, cfg.daily_cap_usd, cfg.max_per_call_usd),
                      timeout=timeout, authorization_used=chain.authorization_used, find_tx=chain.find_tx)
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


def test_settle_that_keeps_failing_gives_clear_error_and_costs_nothing(tmp_path):
    """The bug report: "No answer: HTTP 402: {}" and the cap went down anyway."""
    app, payer, ledger, fac = make(tmp_path, settle_outcomes=["fail", "fail"])
    with serve(app) as url:
        res = payer.post(f"{url}/x402/best-card", {"merchant": "Whole Foods", "amount": 84.5})
    assert not res.ok and not res.paid and res.status == 402
    assert "payment_not_settled" in res.reason
    assert "invalid_exact_evm_transaction_failed" in res.reason
    assert "You were not charged" in res.reason
    assert "{}" not in res.reason
    assert fac.settle_calls == 2  # retried once
    t = ledger.totals()
    assert t["spent_usd"] == 0 and t["failed_count"] == 1
    assert SpendGuard(ledger, "0.05", "0.01").remaining_today() == Decimal("0.05")


def test_settle_retry_recovers_and_charges_once(tmp_path):
    app, payer, ledger, fac = make(tmp_path, settle_outcomes=["raise", "ok"])
    with serve(app) as url:
        res = payer.post(f"{url}/x402/best-card", {"merchant": "Whole Foods", "amount": 84.5})
    assert res.ok and res.paid and res.data["best_card"] == "Aurum Gold"
    assert fac.settle_calls == 2
    assert ledger.totals()["spent_count"] == 1


def test_settled_on_chain_despite_failure_reply_still_returns_the_answer(tmp_path):
    """Never charge without returning the answer: the money moved even though
    the facilitator said it failed, so the server treats it as settled."""
    app, payer, ledger, fac = make(tmp_path, settle_outcomes=["landed-but-failed"])
    with serve(app) as url:
        res = payer.post(f"{url}/x402/best-card", {"merchant": "Whole Foods", "amount": 84.5})
    assert res.ok and res.paid and res.data["best_card"] == "Aurum Gold"
    assert res.tx == FAKE_TX
    assert fac.settle_calls == 1  # no second submit needed
    assert ledger.totals()["spent_count"] == 1


def test_unknown_chain_state_says_so_instead_of_claiming_not_charged(tmp_path):
    app, payer, _, _ = make(tmp_path, settle_outcomes=["fail", "fail"], chain=FakeChain(reachable=False))
    with serve(app) as url:
        res = payer.post(f"{url}/x402/best-card", {"merchant": "Whole Foods", "amount": 84.5})
    assert not res.ok and "couldn't confirm on-chain" in res.reason


def test_rejected_payment_explains_and_costs_nothing(tmp_path):
    app, payer, ledger, fac = make(tmp_path, valid=False)
    with serve(app) as url:
        res = payer.post(f"{url}/x402/best-card", {"merchant": "Whole Foods", "amount": 84.5})
    assert not res.ok and "payment_rejected" in res.reason and "insufficient_funds" in res.reason
    assert fac.settle_calls == 0
    assert ledger.totals()["spent_usd"] == 0


def test_client_timeout_after_settlement_is_counted_from_the_chain(tmp_path):
    """The reply was lost, but the chain shows the payment landed: count it."""
    def slow_pick(**kwargs):
        time.sleep(3)
        return pick()
    app, payer, ledger, _ = make(tmp_path, pick_fn=slow_pick, timeout=1,
                                 chain=FakeChain())
    payer._authorization_used = lambda *a: True
    payer._find_tx = lambda *a: "0xlanded"
    with serve(app) as url:
        res = payer.post(f"{url}/x402/best-card", {"merchant": "Whole Foods", "amount": 84.5})
    assert not res.ok and res.paid and res.tx == "0xlanded"
    assert ledger.totals()["spent_count"] == 1


def test_client_timeout_before_settlement_is_not_counted(tmp_path):
    def slow_pick(**kwargs):
        time.sleep(3)
        return pick()
    app, payer, ledger, _ = make(tmp_path, pick_fn=slow_pick, timeout=1)
    payer._authorization_used = lambda *a: False
    with serve(app) as url:
        res = payer.post(f"{url}/x402/best-card", {"merchant": "Whole Foods", "amount": 84.5})
    assert not res.ok and not res.paid
    assert ledger.totals()["spent_count"] == 0 and ledger.totals()["failed_count"] == 1


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
    assert ledger.spent_today_usd() == Decimal("0.002")


def test_per_call_max_blocks_expensive_endpoint(tmp_path):
    app, payer, ledger, fac = make(tmp_path, per_call="0.001", price="0.005")
    with serve(app) as url:
        res = payer.post(f"{url}/x402/merchant-data", {"merchant": "Sakura Ramen"})
    assert not res.ok and not res.paid
    assert "spend controls" in res.reason or "per-call max" in res.reason
    assert fac.verified == []
    assert ledger.totals()["blocked_count"] == 1
    assert ledger.spent_today_usd() == 0


def test_rejected_request_is_not_settled_and_not_counted(tmp_path):
    app, payer, ledger, fac = make(tmp_path)
    with serve(app) as url:
        res = payer.post(f"{url}/x402/merchant-data", {"merchant": ""})
    assert not res.ok and res.status == 400
    assert fac.settled == []
    t = ledger.totals()
    assert t["spent_usd"] == 0 and t["failed_count"] == 1


def test_unreachable_server_is_a_clean_failure(tmp_path):
    _, payer, _, _ = make(tmp_path)
    res = payer.post("http://127.0.0.1:9/x402/merchant-data", {"merchant": "x"})
    assert not res.ok and "couldn't reach" in res.reason


def test_payer_refuses_mainnet_config(tmp_path):
    cfg = config(tmp_path, x402_network="eip155:8453")
    with pytest.raises(x402_config.X402ConfigError):
        X402Payer(cfg, local_signer(), SpendGuard(Ledger(str(tmp_path)), "1", "1"))
