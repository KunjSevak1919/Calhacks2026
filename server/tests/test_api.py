import pytest

import app as server
from pocketpilot.service import PocketPilot


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    server.pilot = PocketPilot()
    return server.app.test_client()


def test_health(client):
    assert client.get("/health").get_json()["ok"]


def test_wallet_totals(client):
    w = client.get("/api/wallet").get_json()
    assert len(w["cards"]) == 5 and w["total_balance"] == 2140 and w["usage"] == pytest.approx(0.087, abs=0.001)


def test_pick_then_debt_guard(client):
    r = client.post("/api/pick", json={"merchant": "Whole Foods", "amount": 84.5}).get_json()
    assert r["best"]["card_id"] == "aurum" and r["store"]["mcc"] == "5411"
    client.post("/api/settings", json={"debt_guard": True})
    r = client.post("/api/pick", json={"merchant": "Whole Foods", "amount": 84.5}).get_json()
    assert r["best"]["card_id"] == "zero" and "carrying a balance" in r["reason"]


def test_unknown_store_plays_safe(client):
    r = client.post("/api/pick", json={"merchant": "Zzyzx Emporium", "amount": 30}).get_json()
    assert r["uncertain"] and r["best"]["card_id"] == "steady"


def test_bad_pick_input(client):
    assert client.post("/api/pick", json={"amount": 10}).status_code == 400
    assert client.post("/api/pick", json={"merchant": "x", "amount": "ten"}).status_code == 400


def test_notifications_and_approve(client):
    notes = client.get("/api/notifications").get_json()
    assert notes[0]["id"] == "due-aurum"
    res = client.post("/api/notifications/due-aurum/approve").get_json()
    assert res["message"] == "Scheduled $640 to Aurum Gold on Oct 29"
    res = client.post("/api/notifications/sub-streambox/approve").get_json()
    assert "Canceled StreamBox" in res["message"]
    ids = [n["id"] for n in client.get("/api/notifications").get_json()]
    assert "sub-streambox" not in ids


def test_approved_notification_is_gone_and_cannot_be_approved_twice(client):
    assert client.post("/api/notifications/due-aurum/approve").status_code == 200
    ids = [n["id"] for n in client.get("/api/notifications").get_json()]
    assert "due-aurum" not in ids
    assert client.post("/api/notifications/due-aurum/approve").status_code == 404


def test_dismissed_notification_is_gone(client):
    assert client.post("/api/notifications/fee-voyager/dismiss").status_code == 200
    ids = [n["id"] for n in client.get("/api/notifications").get_json()]
    assert "fee-voyager" not in ids
    assert client.post("/api/notifications/fee-voyager/dismiss").status_code == 404


def test_nessie_skips_unknown_cards(monkeypatch):
    from pocketpilot import nessie

    class FakeNessie:
        enabled = True
        def accounts(self, _):
            return [{"type": "Credit Card", "nickname": "Aurum Gold", "balance": 700, "_id": "a1"},
                    {"type": "Credit Card", "nickname": "Mystery Card", "balance": 50, "_id": "x9"}]
        def purchases(self, _):
            return []

    monkeypatch.setattr(nessie, "Nessie", FakeNessie)
    profile = nessie.load_profile(customer_id="c1")
    assert profile["source"] == "nessie"
    assert profile["accounts"]["aurum"]["balance"] == 700.0
    assert set(profile["accounts"]) == {"aurum", "steady", "zero", "spin", "voyager"}
    PocketPilot(profile=profile).wallet()   # must not crash


def test_coach_offline(client):
    r = client.post("/api/coach", json={"question": "Why did my credit score drop?"}).get_json()
    assert r["source"] == "offline" and "Zero Intro" in r["answer"]


def test_payback(client):
    p = client.get("/api/payback/aurum").get_json()
    assert p["minimum_only"]["interest"] > 100
