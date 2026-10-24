from datetime import date

import pytest

from pocketpilot import data, planner, resolver, scorer

TODAY = date(2026, 10, 23)


@pytest.fixture
def profile():
    return data.demo_user()


def grocery(amount=84.50):
    return {"amount": amount, "category": "grocery", "label": "Grocery store"}


# ---------- resolver ----------

def test_real_mcc_wins():
    r = resolver.resolve(merchant="Anything", mcc="5411")
    assert r["category"] == "grocery" and r["confidence"] == 0.99


def test_known_chain_with_store_number():
    r = resolver.resolve(merchant="WHOLEFDS MKT #10234")
    assert r["category"] == "grocery" and r["source"] == "known_merchant"


def test_target_is_not_grocery():
    r = resolver.resolve(merchant="Target")
    assert r["category"] == "discount_store"
    assert "not grocery" in r["note"]


def test_history_beats_table():
    history = [{"merchant": "Blue Door Cafe", "mcc": "5812"}]
    r = resolver.resolve(merchant="blue door cafe", history=history)
    assert r["source"] == "your_history" and r["category"] == "dining"


def test_place_type_fallback_is_medium_confidence():
    r = resolver.resolve(merchant="Tiny Local Market", place_types=["supermarket"])
    assert r["category"] == "grocery" and 0.6 <= r["confidence"] < 0.9


def test_unknown_store_is_low_confidence():
    r = resolver.resolve(merchant="Zzyzx Emporium")
    assert resolver.is_uncertain(r)


def test_airline_range():
    assert resolver.category_for_mcc("3058")[0] == "airlines"


# ---------- scorer ----------

def test_grocery_picks_four_x_card(profile):
    ranked = scorer.rank(data.cards(), profile["accounts"], grocery(), False, TODAY)
    assert ranked[0]["card_id"] == "aurum"
    assert ranked[0]["reward"] == pytest.approx(3.38, abs=0.01)


def test_debt_guard_switches_to_zero_apr(profile):
    ranked = scorer.rank(data.cards(), profile["accounts"], grocery(), True, TODAY)
    best = ranked[0]
    assert best["card_id"] == "zero" and best["interest"] == 0
    aurum = next(s for s in ranked if s["card_id"] == "aurum")
    assert aurum["interest"] == pytest.approx(6.32, abs=0.01)
    assert "carrying a balance" in scorer.reason(best, ranked, grocery(), True)


def test_rotating_gas_bonus(profile):
    ranked = scorer.rank(data.cards(), profile["accounts"], {"amount": 40, "category": "gas"}, False, TODAY)
    assert ranked[0]["card_id"] == "spin" and ranked[0]["reward"] == pytest.approx(2.0)


def test_unknown_store_falls_back_to_flat_rate(profile):
    ranked = scorer.rank(data.cards(), profile["accounts"], {"amount": 50, "category": "unknown"}, False, TODAY)
    assert ranked[0]["card_id"] == "steady"


def test_over_limit_card_goes_last(profile):
    accounts = {**profile["accounts"], "aurum": {**profile["accounts"]["aurum"], "balance": 4990.0}}
    ranked = scorer.rank(data.cards(), accounts, grocery(), False, TODAY)
    assert ranked[-1]["card_id"] == "aurum" and not ranked[-1]["eligible"]


def test_intro_apr_expires():
    zero = data.card_by_id("zero")
    assert scorer.effective_apr(zero, TODAY) == 0.0
    assert scorer.effective_apr(zero, date(2027, 7, 1)) == 22.9


# ---------- planner ----------

def test_due_soon_is_payday_aware(profile):
    due = planner.due_soon(data.cards(), profile["accounts"], TODAY, profile["payday"], profile["checking_balance"])
    assert due[0]["card_id"] == "aurum"
    assert due[0]["pay_on"] == "2026-10-29"
    assert due[0]["suggested"] == 640.0
    assert due[0]["interest_saved"] == pytest.approx(15.95, abs=0.01)


def test_payback_minimum_costs_more():
    p = planner.payback(640, 29.9)
    assert p["minimum_only"]["months"] > 12
    assert p["minimum_only"]["interest"] > 100


def test_annual_fee_not_worth_it(profile):
    fees = planner.annual_fee_checks(data.cards(), profile["accounts"], TODAY)
    assert fees[0]["card_id"] == "voyager" and fees[0]["net"] == -54.0 and not fees[0]["worth_it"]


def test_notifications_cover_findings(profile):
    kinds = {n["kind"] for n in planner.notifications(data.cards(), profile, TODAY)}
    assert {"due", "subscription", "annual_fee", "credit", "signup_bonus"} <= kinds


def test_usage_tip():
    card = data.card_by_id("spin")
    tip = planner.usage_tip(card, {"balance": 1000, "limit": 2500, "statement_close": "2026-11-13"})
    assert tip["pay"] == 250.0
