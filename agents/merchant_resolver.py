"""Read-only wrapper around server/pocketpilot/resolver.py's deterministic
merchant resolver. No uagents import here, so this is directly testable
without a live agent runtime -- mirrors dispatch.py's split from
pocket_pilot_agent.py.

Imports server/pocketpilot/resolver.py (and its only dependency, data.py)
by appending server/ to sys.path -- no copy, no edits to server/. Appending
(not prepending) keeps it from ever shadowing agents/'s own modules.
resolver.py does no I/O beyond reading static JSON files in
server/pocketpilot/data/, so importing it here is safe and side-effect-free.
No LLM anywhere in this path.
"""
import os
import sys

_SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server"))
if _SERVER_DIR not in sys.path:
    sys.path.append(_SERVER_DIR)

from pocketpilot import resolver as server_resolver  # noqa: E402

LOW_CONFIDENCE = server_resolver.LOW_CONFIDENCE
normalize = server_resolver.normalize


def resolve_store(merchant=None, mcc=None, place_types=None, domain=None):
    """Returns (result, needs_paid_lookup). result has the same shape as
    server_resolver.resolve(): merchant, mcc, category, label, confidence,
    source, note. needs_paid_lookup is True when confidence is below
    LOW_CONFIDENCE -- the hook for the paid lookup in paid_lookup.py
    (Coinbase x402)."""
    result = server_resolver.resolve(merchant=merchant, mcc=mcc, place_types=place_types, domain=domain)
    needs_paid_lookup = result["confidence"] < LOW_CONFIDENCE
    return result, needs_paid_lookup


def from_paid_lookup(merchant, mcc, confidence, note):
    """A result (same shape as resolve_store's) built from a paid lookup's
    mcc, with category/label from the same server MCC table."""
    category, label = server_resolver.category_for_mcc(mcc)
    return {"merchant": merchant, "mcc": str(mcc), "category": category, "label": label,
            "confidence": confidence, "source": "paid_lookup_x402", "note": note}
