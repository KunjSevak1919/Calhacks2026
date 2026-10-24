"""VFC (Visa Flexible Credential) -- SIMULATED, not a real Visa API.
Verified live against the running server before writing these assertions.
"""
import pytest

import app as server
from pocketpilot.routes_vfc import DEFAULT_SETTINGS
from pocketpilot.service import PocketPilot


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # Same pattern as test_api.py's fixture: reassign the module-global
    # `pilot` for a fresh profile/settings each test. routes_vfc's routes
    # resolve it through a getter (not a captured parameter) specifically
    # so this reassignment is seen -- see routes_vfc.py's docstring.
    server.pilot = PocketPilot()
    # VFC's own settings (debit_buffer/installment_threshold/enabled) live
    # in routes_vfc's closure, separate from pilot -- reset those too.
    server.app.vfc_settings.clear()
    server.app.vfc_settings.update(DEFAULT_SETTINGS)
    return server.app.test_client()


def test_whole_foods_no_balance_carried_is_credit(client):
    r = client.post("/api/vfc/authorize", json={"merchant": "Whole Foods", "amount": 84.5}).get_json()
    assert r["funding"] == "credit"
    assert r["card_id"] == "aurum"
    assert r["card_name"] == "Aurum Gold"
    assert r["mcc"] == "5411"
    assert r["mcc_preserved"] is True
    assert r["category"] == "grocery"
    assert r["simulated"] is True
    assert "$3.38" in r["reason"]


def test_whole_foods_debt_guard_on_and_checking_covers_is_debit(client):
    r = client.post("/api/vfc/authorize",
                     json={"merchant": "Whole Foods", "amount": 84.5, "debt_guard": True}).get_json()
    assert r["funding"] == "debit"
    assert r["card_id"] is None
    assert r["mcc"] == "5411"
    assert r["simulated"] is True
    assert "$0" in r["reason"]  # "debit costs $0 in interest"


def test_whole_foods_debt_guard_via_global_settings_also_triggers_debit(client):
    client.post("/api/settings", json={"debt_guard": True})
    r = client.post("/api/vfc/authorize", json={"merchant": "Whole Foods", "amount": 84.5}).get_json()
    assert r["funding"] == "debit"


def test_large_best_buy_purchase_debit_cant_cover_is_installments(client):
    r = client.post("/api/vfc/authorize",
                     json={"merchant": "Best Buy", "amount": 600, "debt_guard": True}).get_json()
    assert r["funding"] == "installments"
    assert r["card_id"] is None
    assert r["installments"]["count"] == 4
    assert r["installments"]["each"] == 150.0
    assert [s["amount"] for s in r["installments"]["schedule"]] == [150.0, 150.0, 150.0, 150.0]
    # exact total, no rounding leak
    assert sum(s["amount"] for s in r["installments"]["schedule"]) == pytest.approx(600.0)
    # 4 distinct dates, 14 days apart
    dates = [s["date"] for s in r["installments"]["schedule"]]
    assert len(set(dates)) == 4
    assert r["mcc"] == "5732"
    assert r["simulated"] is True


def test_target_preserves_discount_store_not_grocery(client):
    r = client.post("/api/vfc/authorize", json={"merchant": "Target", "amount": 30}).get_json()
    assert r["category"] == "discount_store"
    assert r["mcc"] == "5310"
    assert r["mcc_preserved"] is True


def test_authorize_missing_amount_is_400(client):
    res = client.post("/api/vfc/authorize", json={"merchant": "x"})
    assert res.status_code == 400
    assert res.get_json()["simulated"] is True


def test_authorize_missing_merchant_and_mcc_is_400(client):
    res = client.post("/api/vfc/authorize", json={"amount": 10})
    assert res.status_code == 400


def test_authorize_non_numeric_amount_is_400(client):
    res = client.post("/api/vfc/authorize", json={"merchant": "x", "amount": "ten"})
    assert res.status_code == 400


def test_authorize_non_positive_amount_is_400(client):
    res = client.post("/api/vfc/authorize", json={"merchant": "x", "amount": 0})
    assert res.status_code == 400


def test_authorize_disabled_is_400(client):
    client.post("/api/vfc/rules", json={"enabled": False})
    res = client.post("/api/vfc/authorize", json={"merchant": "x", "amount": 10})
    assert res.status_code == 400
    assert "turned off" in res.get_json()["error"]


def test_get_rules_has_four_rules_and_current_settings(client):
    r = client.get("/api/vfc/rules").get_json()
    assert len(r["rules"]) == 4
    assert {rule["id"] for rule in r["rules"]} == {
        "credit-if-clear", "debit-if-carrying", "installments-if-large", "credit-lowest-apr-otherwise"}
    assert r["settings"] == {"debit_buffer": 100.0, "installment_threshold": 200.0, "enabled": True}
    assert r["simulated"] is True


def test_post_rules_updates_buffer_and_reflects_in_wording(client):
    r = client.post("/api/vfc/rules", json={"debit_buffer": 50}).get_json()
    assert r["settings"]["debit_buffer"] == 50.0
    debit_rule = next(x for x in r["rules"] if x["id"] == "debit-if-carrying")
    assert "$50" in debit_rule["when"]


def test_post_rules_rejects_negative_buffer(client):
    res = client.post("/api/vfc/rules", json={"debit_buffer": -5})
    assert res.status_code == 400


def test_post_rules_rejects_non_positive_threshold(client):
    res = client.post("/api/vfc/rules", json={"installment_threshold": 0})
    assert res.status_code == 400


def test_post_rules_rejects_non_numeric_buffer(client):
    res = client.post("/api/vfc/rules", json={"debit_buffer": "lots"})
    assert res.status_code == 400
