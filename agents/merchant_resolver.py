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


def resolve_store(merchant=None, mcc=None, place_types=None, domain=None):
    """Returns (result, needs_paid_lookup). result has the same shape as
    server_resolver.resolve(): merchant, mcc, category, label, confidence,
    source, note. needs_paid_lookup is True when confidence is below
    LOW_CONFIDENCE -- the hook for a future paid lookup (Coinbase x402),
    not built here."""
    result = server_resolver.resolve(merchant=merchant, mcc=mcc, place_types=place_types, domain=domain)
    needs_paid_lookup = result["confidence"] < LOW_CONFIDENCE
    return result, needs_paid_lookup
