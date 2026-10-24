import card_scorer
import messages


def _resolve_response(**kw):
    defaults = dict(request_id="r1", ok=True, merchant="Costco", category="warehouse_club",
                     label="Warehouse club", mcc="5300", confidence=0.9, source="known_merchant",
                     note="Warehouse club, not grocery", needs_paid_lookup=False)
    defaults.update(kw)
    return messages.ResolveResponse(**defaults)


def test_high_confidence_passes_mcc_through():
    resp = _resolve_response(confidence=0.9)
    mcc, store_info = card_scorer.decide_mcc(resp)
    assert mcc == "5300"
    assert store_info["category"] == "warehouse_club"
    assert store_info["note"] == "Warehouse club, not grocery"


def test_low_confidence_passes_name_only():
    resp = _resolve_response(confidence=0.3, mcc=None, category="unknown", label="Unknown",
                              source="none", note=None)
    mcc, store_info = card_scorer.decide_mcc(resp)
    assert mcc is None
    # store_info is still populated -- the chat/ScoreResponse can still
    # mention what little was learned, even though it wasn't trusted enough
    # to send to the server.
    assert store_info["confidence"] == 0.3


def test_resolver_timeout_falls_back_to_name_only():
    mcc, store_info = card_scorer.decide_mcc(None)
    assert mcc is None
    assert store_info == {}


def test_resolver_answered_but_not_ok_falls_back_to_name_only():
    resp = _resolve_response(ok=False, error="boom")
    mcc, store_info = card_scorer.decide_mcc(resp)
    assert mcc is None
    assert store_info == {}


def test_exactly_at_threshold_is_trusted():
    resp = _resolve_response(confidence=card_scorer.CONFIDENCE_THRESHOLD)
    mcc, _ = card_scorer.decide_mcc(resp)
    assert mcc == "5300"
