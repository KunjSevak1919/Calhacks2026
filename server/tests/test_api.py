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



def test_nessie_uses_https():
    from pocketpilot import nessie
    assert nessie.BASE.startswith("https://")


def test_nessie_merchant_category_string_or_list(monkeypatch):
    from pocketpilot import nessie

    class FakeNessie:
        enabled = True
        def accounts(self, _):
            return [{"type": "Credit Card", "nickname": "Aurum Gold", "balance": 700, "_id": "a1"}]
        def purchases(self, _):
            return [{"merchant_id": "m1"}, {"merchant_id": "m2"}, {"merchant_id": "m3"}]
        def merchant(self, mid):
            return {"m1": {"name": "Shell", "category": "gas"},
                    "m2": {"name": "Chipotle", "category": ["dining"]},
                    "m3": {"name": "Target"}}[mid]

    monkeypatch.setattr(nessie, "Nessie", FakeNessie)
    history = nessie.load_profile(customer_id="c1")["nessie_history"]
    assert [h["categories"] for h in history] == [["gas"], ["dining"], []]


def test_nessie_errors_hide_api_key(monkeypatch):
    import requests
    from pocketpilot import nessie

    def refuse(method, url, params=None, **kw):
        raise requests.ConnectionError(
            f"Max retries exceeded with url: /customers/c1/accounts?key={params['key']}")

    monkeypatch.setattr(nessie.requests, "request", refuse)
    with pytest.raises(requests.ConnectionError) as e:
        nessie.Nessie(key="SECRET123").accounts("c1")
    assert "SECRET123" not in str(e.value) and "key=***" in str(e.value)
    assert e.value.__cause__ is None and e.value.__suppress_context__


def test_nessie_http_error_hides_api_key(monkeypatch):
    import requests
    from pocketpilot import nessie

    class Resp:
        status_code = 400
        def raise_for_status(self):
            raise requests.HTTPError(
                "400 Client Error for url: https://api.nessieisreal.com/merchants?key=SECRET123",
                response=self)

    monkeypatch.setattr(nessie.requests, "request", lambda *a, **kw: Resp())
    with pytest.raises(requests.HTTPError) as e:
        nessie.Nessie(key="SECRET123")._post("/merchants", {"name": "Shell", "category": "gas"})
    assert "SECRET123" not in str(e.value) and e.value.response.status_code == 400


def test_nessie_sends_key_as_param(monkeypatch):
    from pocketpilot import nessie
    calls = []

    class Resp:
        def raise_for_status(self):
            pass
        def json(self):
            return []

    def record(method, url, **kw):
        calls.append((method, url, kw))
        return Resp()

    monkeypatch.setattr(nessie.requests, "request", record)
    nessie.Nessie(key="k").accounts("c1")
    assert calls[0][:2] == ("GET", "https://api.nessieisreal.com/customers/c1/accounts")
    assert calls[0][2]["params"] == {"key": "k"}


def test_seed_sends_merchant_category_as_string(monkeypatch):
    import importlib.util
    import os

    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **kw: None)   # keep real keys out of tests
    path = os.path.join(os.path.dirname(__file__), "..", "scripts", "seed_nessie.py")
    spec = importlib.util.spec_from_file_location("seed_nessie", path)
    seed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed)
    assert all(isinstance(cat, str) for _, cat, _, _ in seed.MERCHANTS)

def test_coach_offline(client):
    r = client.post("/api/coach", json={"question": "Why did my credit score drop?"}).get_json()
    assert r["source"] == "offline" and "Zero Intro" in r["answer"]


def test_payback(client):
    p = client.get("/api/payback/aurum").get_json()
    assert p["minimum_only"]["interest"] > 100
