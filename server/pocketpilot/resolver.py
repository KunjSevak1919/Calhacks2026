"""Figure out what kind of store a purchase is at, before the card is tapped.

The real merchant category code (MCC) only exists once a transaction is made,
so in a store we predict it. Signals, strongest first:
  1. An MCC from a real transaction (live swipe or posted purchase)
  2. The user's own history at this merchant
  3. Our table of known chains (with overrides like Target = discount store)
  4. The place type from a maps API (supermarket, gas_station, ...)
"""
import re

from rapidfuzz import fuzz, process

from . import data

LOW_CONFIDENCE = 0.6


def category_for_mcc(mcc):
    """Return (category, label) for an MCC string, or ('other', 'Other')."""
    if mcc is None:
        return "unknown", "Unknown"
    table = data.mcc_table()
    code = str(mcc).strip()
    if code in table["codes"]:
        entry = table["codes"][code]
        return entry["category"], entry["label"]
    if code.isdigit():
        n = int(code)
        for r in table["ranges"]:
            if r["from"] <= n <= r["to"]:
                return r["category"], r["label"]
    return "other", "Other"


def normalize(name):
    name = (name or "").lower()
    name = re.sub(r"#\s*\d+", " ", name)          # store numbers like "#10234"
    name = re.sub(r"[^a-z0-9 ]+", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def _match_known(merchant, domain=None):
    known = data.merchants()
    if domain:
        d = domain.lower().removeprefix("www.")
        for m in known:
            if m.get("domain") and d.endswith(m["domain"]):
                return m, 100
    target = normalize(merchant)
    if not target:
        return None, 0
    choices = {}
    for m in known:
        for alias in [m["name"], *m.get("aliases", [])]:
            choices[normalize(alias)] = m
    hit = process.extractOne(target, list(choices), scorer=fuzz.WRatio)
    if hit is None:
        return None, 0
    alias, score, _ = hit
    return choices[alias], score


def resolve(merchant=None, mcc=None, place_types=None, domain=None, history=None):
    """Return the best guess for a store, with a confidence from 0 to 1."""
    result = {"merchant": merchant, "mcc": None, "category": "unknown",
              "label": "Unknown", "confidence": 0.3, "source": "none", "note": None}

    def finish(code, confidence, source, note=None, name=None):
        cat, label = category_for_mcc(code)
        result.update(mcc=str(code), category=cat, label=label,
                      confidence=confidence, source=source, note=note)
        if name:
            result["merchant"] = name
        return result

    if mcc:
        return finish(mcc, 0.99, "transaction")

    for h in history or []:
        if merchant and normalize(h["merchant"]) == normalize(merchant):
            return finish(h["mcc"], 0.95, "your_history", name=h["merchant"])

    known, score = _match_known(merchant, domain)
    if known and score >= 88:
        return finish(known["mcc"], 0.9, "known_merchant",
                      note=known.get("override_note"), name=known["name"])

    type_map = data.mcc_table()["place_types"]
    for t in place_types or []:
        if t in type_map:
            return finish(type_map[t], 0.65, "place_type")

    return result


def is_uncertain(resolved):
    return resolved["confidence"] < LOW_CONFIDENCE
