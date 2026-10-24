"""Pure decision logic for Card Scorer: no uagents import here, so it's
directly testable without a live agent runtime -- mirrors dispatch.py's
split from pocket_pilot_agent.py. card_scorer_agent.py wires decide_mcc()
around the actual ctx.send_and_receive call to the Merchant Resolver.
"""

# Matches server/pocketpilot/resolver.py's own LOW_CONFIDENCE constant
# (0.6). Kept as a literal here (rather than importing server/ internals a
# second time) since merchant_resolver.py already owns that import for the
# Merchant Resolver agent itself -- revisit if that constant ever changes.
CONFIDENCE_THRESHOLD = 0.6


def decide_mcc(resolver_response):
    """resolver_response is a ResolveResponse-like object (ok, confidence,
    mcc, category, source, note) or None (resolver unreachable/timed out,
    or it answered but reported failure).

    Returns (mcc_to_use, store_info): mcc_to_use is only set when the
    Resolver was confident enough to trust (>= CONFIDENCE_THRESHOLD) --
    otherwise None, so the caller sends the server the merchant name only
    and lets it play safe. store_info carries whatever was learned either
    way (possibly {}), since it's needed for the chat/ScoreResponse note
    even when confidence was too low to use the mcc itself."""
    if resolver_response is None or not resolver_response.ok:
        return None, {}

    store_info = {"category": resolver_response.category, "mcc": resolver_response.mcc,
                  "confidence": resolver_response.confidence, "source": resolver_response.source,
                  "note": resolver_response.note}

    confidence = resolver_response.confidence
    if confidence is not None and confidence >= CONFIDENCE_THRESHOLD:
        return resolver_response.mcc, store_info
    return None, store_info
