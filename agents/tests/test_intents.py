import pytest

import intents


def test_pick_with_merchant_and_amount():
    parsed = intents.parse_intent("Which card should I use at Whole Foods for $84.50?")
    assert parsed["intent"] == "pick"
    assert parsed["merchant"] == "Whole Foods"
    assert parsed["amount"] == 84.50


def test_pick_amount_as_words():
    parsed = intents.parse_intent("use at Target for 42 dollars")
    assert parsed["intent"] == "pick"
    assert parsed["amount"] == 42.0


def test_debt_guard_on_from_carrying_balance():
    parsed = intents.parse_intent("I'm carrying a balance")
    assert parsed["intent"] == "debt_guard_on"


def test_debt_guard_explicit_on():
    parsed = intents.parse_intent("turn on debt guard")
    assert parsed["intent"] == "debt_guard_on"


def test_debt_guard_explicit_off():
    parsed = intents.parse_intent("turn off debt guard")
    assert parsed["intent"] == "debt_guard_off"


def test_notifications_intent():
    parsed = intents.parse_intent("anything due soon?")
    assert parsed["intent"] == "notifications"


def test_yes_without_pending_is_not_confirm():
    parsed = intents.parse_intent("yes", has_pending=False)
    assert parsed["intent"] == "confirm_yes"


def test_no_with_pending():
    parsed = intents.parse_intent("no thanks", has_pending=True)
    assert parsed["intent"] == "confirm_no"


def test_pay_intent():
    parsed = intents.parse_intent("I paid at Whole Foods $84.50 with Zero Intro")
    assert parsed["intent"] == "pay"
    assert parsed["merchant"] == "Whole Foods"
    assert parsed["amount"] == 84.50
    assert parsed["card"] == "Zero Intro"


def test_impact_intent():
    parsed = intents.parse_intent("How much have you saved me?")
    assert parsed["intent"] == "impact"


def test_coach_intent():
    parsed = intents.parse_intent("Why did my score drop?")
    assert parsed["intent"] == "coach"


def test_reset_demo_intent():
    parsed = intents.parse_intent("please reset demo")
    assert parsed["intent"] == "reset_demo"


def test_help_intent():
    parsed = intents.parse_intent("help")
    assert parsed["intent"] == "help"


def test_unknown_intent():
    parsed = intents.parse_intent("blah blah nonsense")
    assert parsed["intent"] == "unknown"


def test_vfc_authorize_intent_how_should_i_pay():
    parsed = intents.parse_intent("How should I pay for a $600 laptop at Best Buy?")
    assert parsed["intent"] == "vfc_authorize"
    assert parsed["merchant"] == "Best Buy"
    assert parsed["amount"] == 600.0


def test_vfc_authorize_intent_pay_with_visa_flexible():
    parsed = intents.parse_intent("pay with visa flexible at Whole Foods $84.50")
    assert parsed["intent"] == "vfc_authorize"
    assert parsed["merchant"] == "Whole Foods"
    assert parsed["amount"] == 84.50


def test_vfc_rules_intent():
    parsed = intents.parse_intent("show my Visa rules")
    assert parsed["intent"] == "vfc_rules"


def test_store_kind_intent():
    parsed = intents.parse_intent("What kind of store is Costco?")
    assert parsed["intent"] == "store_kind"
    assert parsed["merchant"] == "Costco"


def test_store_kind_intent_type_variant():
    parsed = intents.parse_intent("what type of store is Whole Foods")
    assert parsed["intent"] == "store_kind"
    assert parsed["merchant"] == "Whole Foods"


def test_llm_fallback_disabled_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert intents.parse_intent_llm("anything") is None


# ---------- ASI:One prepends the literal agent address as an @-mention in the
# message text (confirmed: https://asi1.ai/blog/mastering-at-mentions, e.g.
# "@agent1qde95qr0dzcnhhs8f65hkwujn9mh89jx0u7u7g6nv3tm2jxvjwhkunvessq please
# get me weather of San Francisco") -- this broke "yes"/"no" matching because
# neither exact-match nor startswith survives an unstripped mention prefix. ----------

MENTION = "@agent1qde95qr0dzcnhhs8f65hkwujn9mh89jx0u7u7g6nv3tm2jxvjwhkunvessq"


def test_normalize_text_strips_mention_and_whitespace():
    assert intents.normalize_text(f"{MENTION}   yes  ") == "yes"


def test_normalize_text_preserves_amount_punctuation():
    assert intents.normalize_text(f"{MENTION} use at Target for $42.50") == "use at Target for $42.50"


def test_mentioned_yes_is_confirm_yes_without_pending():
    parsed = intents.parse_intent(f"{MENTION} yes", has_pending=False)
    assert parsed["intent"] == "confirm_yes"


def test_mentioned_yes_is_confirm_yes_with_pending():
    parsed = intents.parse_intent(f"{MENTION} yes", has_pending=True)
    assert parsed["intent"] == "confirm_yes"


def test_mentioned_no_is_confirm_no():
    parsed = intents.parse_intent(f"{MENTION} no", has_pending=True)
    assert parsed["intent"] == "confirm_no"


def test_mentioned_pick_still_parses_merchant_and_amount():
    parsed = intents.parse_intent(f"{MENTION} use at Whole Foods for $84.50")
    assert parsed["intent"] == "pick"
    assert parsed["merchant"] == "Whole Foods"
    assert parsed["amount"] == 84.50


def test_mentioned_store_kind_still_parses_merchant():
    parsed = intents.parse_intent(f"{MENTION} what kind of store is Costco?")
    assert parsed["intent"] == "store_kind"
    assert parsed["merchant"] == "Costco"


def test_mentioned_vfc_authorize_still_parses_merchant_and_amount():
    parsed = intents.parse_intent(f"{MENTION} pay with visa flexible at Whole Foods $84.50")
    assert parsed["intent"] == "vfc_authorize"
    assert parsed["merchant"] == "Whole Foods"
    assert parsed["amount"] == 84.50


def test_trailing_punctuation_on_yes_still_matches():
    parsed = intents.parse_intent("yes!", has_pending=True)
    assert parsed["intent"] == "confirm_yes"


@pytest.mark.parametrize("word", ["yes", "y", "yeah", "approve", "do it", "confirm"])
def test_required_yes_words(word):
    assert intents.parse_intent(word, has_pending=True)["intent"] == "confirm_yes"


@pytest.mark.parametrize("word", ["no", "later", "skip"])
def test_required_no_words(word):
    assert intents.parse_intent(word, has_pending=True)["intent"] == "confirm_no"
