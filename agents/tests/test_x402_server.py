import base64
import json
from decimal import Decimal

import pytest
import requests
from x402 import x402ClientSync
from x402.http.clients import wrapRequestsWithPayment
from x402.http.utils import decode_payment_response_header
from x402.mechanisms.evm.exact import register_exact_evm_client

import api_client
import x402_config
import x402_server
from tests.x402_fakes import FAKE_TX, SELLER, FakeFacilitator, config, local_signer, serve
from x402_ledger import Ledger

# Trimmed from a live POST /api/pick {"merchant":"Whole Foods","amount":84.5}.
PICK_WHOLE_FOODS = {
    "best": {"card_id": "aurum", "name": "Aurum Gold", "rate_label": "4% on grocery",
             "reward": 3.38, "interest": 0.0, "net": 3.38, "apr": 29.9},
    "debt_guard": False,
    "ranked": [{"card_id": "aurum", "name": "Aurum Gold", "net": 3.38},
               {"card_id": "steady", "name": "Steady 2%", "net": 1.69}],
    "reason": "Grocery store: Aurum Gold earns 4% on grocery, $3.38 back, the most of your 5 cards.",
    "store": {"category": "grocery", "confidence": 0.9, "label": "Grocery store", "mcc": "5411",
              "merchant": "Whole Foods Market", "note": None, "source": "known_merchant"},
    "uncertain": False,
}


def fake_pick(**kwargs):
    fake_pick.calls.append(kwargs)
    return PICK_WHOLE_FOODS


@pytest.fixture
def setup(tmp_path):
    fake_pick.calls = []
    cfg = config(tmp_path)
    fac = FakeFacilitator()
    ledger = Ledger(str(tmp_path))
    app = x402_server.create_app(cfg, fac, SELLER, ledger, pick=fake_pick)
    with serve(app) as url:
        yield url, fac, ledger


def paying_session():
    client = x402ClientSync()
    register_exact_evm_client(client, local_signer(), networks="eip155:84532")
    return wrapRequestsWithPayment(requests.Session(), client)


def test_unpaid_request_gets_402_with_payment_requirements(setup):
    url, fac, _ = setup
    r = requests.post(f"{url}/x402/best-card", json={"merchant": "Whole Foods", "amount": 84.5}, timeout=10)
    assert r.status_code == 402
    required = json.loads(base64.b64decode(r.headers["PAYMENT-REQUIRED"]))
    accept = required["accepts"][0]
    assert accept["scheme"] == "exact"
    assert accept["network"] == "eip155:84532"
    assert accept["asset"] == x402_config.TESTNETS["eip155:84532"]["usdc"]
    assert accept["amount"] == "1000"  # $0.001 in 6-decimal USDC
    assert accept["payTo"] == SELLER
    assert fake_pick.calls == []  # no free answer
    assert fac.settled == []


def test_paid_request_gets_the_answer_and_a_receipt(setup):
    url, fac, ledger = setup
    r = paying_session().post(f"{url}/x402/best-card",
                              json={"merchant": "Whole Foods", "amount": 84.5, "debt_guard": True}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["best_card"] == "Aurum Gold"
    assert body["mcc"] == "5411"
    assert body["reason"]
    assert fake_pick.calls == [{"merchant": "Whole Foods", "amount": 84.5, "debt_guard": True}]
    receipt = decode_payment_response_header(r.headers["PAYMENT-RESPONSE"])
    assert receipt.success and receipt.transaction == FAKE_TX
    assert len(fac.settled) == 1
    t = ledger.totals()
    assert t["earned_usd"] == Decimal("0.001") and t["earned_count"] == 1
    assert t["last_earned_tx"] == FAKE_TX


def test_bad_input_is_rejected_and_never_settled(setup):
    url, fac, ledger = setup
    r = paying_session().post(f"{url}/x402/best-card", json={"merchant": "", "amount": -3}, timeout=10)
    assert r.status_code == 400
    assert fac.settled == []
    assert ledger.totals()["earned_count"] == 0


def test_engine_down_returns_502_and_never_settles(tmp_path):
    def broken_pick(**kwargs):
        raise api_client.ApiError("down")
    fac = FakeFacilitator()
    ledger = Ledger(str(tmp_path))
    app = x402_server.create_app(config(tmp_path), fac, SELLER, ledger, pick=broken_pick)
    with serve(app) as url:
        r = paying_session().post(f"{url}/x402/best-card", json={"merchant": "Costco", "amount": 42}, timeout=10)
    assert r.status_code == 502
    assert fac.settled == []
    assert ledger.totals()["earned_count"] == 0


def test_merchant_data_is_paid_and_labelled_simulated(setup):
    url, _, _ = setup
    assert requests.post(f"{url}/x402/merchant-data", json={"merchant": "Sakura Ramen"}, timeout=10).status_code == 402
    r = paying_session().post(f"{url}/x402/merchant-data", json={"merchant": "Sakura Ramen"}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is True and body["mcc"] == "5812"
    assert body["simulated"] is True and "simulated" in body["source"]


def test_merchant_data_unknown_store_is_not_found(setup):
    url, _, _ = setup
    body = paying_session().post(f"{url}/x402/merchant-data", json={"merchant": "Zzyzx Emporium"}, timeout=10).json()
    assert body["found"] is False and "mcc" not in body


def test_stats_and_health_are_free(setup):
    url, _, _ = setup
    assert requests.get(f"{url}/x402/stats", timeout=10).json()["earned_count"] == 0
    assert requests.get(f"{url}/health", timeout=10).json()["ok"] is True


def test_server_refuses_mainnet(tmp_path):
    with pytest.raises(x402_config.X402ConfigError):
        x402_server.create_app(config(tmp_path, x402_network="eip155:8453"), FakeFacilitator(),
                               SELLER, Ledger(str(tmp_path)), pick=fake_pick)


def test_best_card_reply_handles_missing_fields():
    reply = x402_server.best_card_reply("Somewhere", 5.0, {})
    assert reply["merchant"] == "Somewhere" and reply["best_card"] is None and reply["runner_up"] is None
