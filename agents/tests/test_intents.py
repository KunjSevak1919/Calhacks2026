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


def test_llm_fallback_disabled_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert intents.parse_intent_llm("anything") is None
