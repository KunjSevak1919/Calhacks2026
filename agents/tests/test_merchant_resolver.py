import merchant_resolver


def test_whole_foods_is_grocery():
    result, needs_paid_lookup = merchant_resolver.resolve_store(merchant="Whole Foods")
    assert result["category"] == "grocery"
    assert result["mcc"] == "5411"
    assert needs_paid_lookup is False


def test_costco_is_warehouse_club_with_override_note():
    result, needs_paid_lookup = merchant_resolver.resolve_store(merchant="Costco")
    assert result["category"] == "warehouse_club"
    assert result["mcc"] == "5300"
    assert result["note"] == "Warehouse club, not grocery"
    assert needs_paid_lookup is False


def test_real_mcc_wins_over_merchant_name():
    # A real transaction MCC should win even when the merchant name alone
    # would resolve differently.
    result, needs_paid_lookup = merchant_resolver.resolve_store(merchant="Some Random Shop", mcc="5411")
    assert result["mcc"] == "5411"
    assert result["category"] == "grocery"
    assert result["confidence"] == 0.99
    assert result["source"] == "transaction"
    assert needs_paid_lookup is False


def test_unknown_merchant_is_low_confidence_and_needs_paid_lookup():
    result, needs_paid_lookup = merchant_resolver.resolve_store(merchant="Bob's Totally Made Up Shop")
    assert result["confidence"] < merchant_resolver.LOW_CONFIDENCE
    assert needs_paid_lookup is True
