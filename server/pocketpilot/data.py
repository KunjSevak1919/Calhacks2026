"""Load the static JSON tables that ship with the app."""
import json
from datetime import date
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"


def _load(name):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=None)
def cards():
    return _load("cards.json")["cards"]


@lru_cache(maxsize=None)
def mcc_table():
    return _load("mcc.json")


@lru_cache(maxsize=None)
def merchants():
    return _load("merchants.json")["merchants"]


def demo_user():
    # Not cached: the server keeps its own mutable copy.
    return _load("demo_user.json")


def card_by_id(card_id):
    return next((c for c in cards() if c["id"] == card_id), None)


def parse_date(value):
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


def nice_date(value):
    """'2026-10-30' -> 'Oct 30' (works on every OS)."""
    d = parse_date(value)
    return f"{d:%b} {d.day}" if d else ""
