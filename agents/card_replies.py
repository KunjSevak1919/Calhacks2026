"""Plain-text chat replies about the user's own cards: wallet overview,
one card's details, payback plans, annual fee checks. Pure functions over
the Flask API's JSON (no uagents import, no API calls, no money math beyond
formatting), so every number shown comes straight from the server.
"""
import re
from datetime import date as _date

MISSING = "—"


def money(value):
    if value is None:
        return MISSING
    try:
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return MISSING


def percent(fraction):
    """0.128 -> "13%". Server sends usage as a fraction."""
    if fraction is None:
        return MISSING
    try:
        return f"{float(fraction) * 100:.0f}%"
    except (TypeError, ValueError):
        return MISSING


def apr(value):
    try:
        return f"{float(value):g}% APR"
    except (TypeError, ValueError):
        return f"{MISSING} APR"


def nice_date(iso):
    try:
        d = _date.fromisoformat(iso)
    except (TypeError, ValueError):
        return iso or MISSING
    return f"{d:%b} {d.day}"


# ---------- card name matching ----------

def _tokens(text):
    return re.sub(r"[^a-z0-9%]+", " ", (text or "").lower()).split()


def _candidates(card):
    """Ways a user might name this card: full name, its id, or any
    distinctive word of the name ("aurum", "intro", "voyager")."""
    name = _tokens(card.get("name"))
    out = [" ".join(name), (card.get("id") or "").lower()]
    out += [t for t in name if len(t) >= 4 and not t.rstrip("%").isdigit()]
    return [c for c in out if c]


def find_card(text, cards):
    """The card named anywhere in text (case-insensitive, partial names
    OK), preferring the longest match. None if no card is named."""
    words = f" {' '.join(_tokens(text))} "
    best, best_len = None, 0
    for card in cards:
        for cand in _candidates(card):
            if f" {cand} " in words and len(cand) > best_len:
                best, best_len = card, len(cand)
    return best


def card_names(cards):
    return ", ".join(c.get("name", "?") for c in cards)


def unknown_card(query, cards):
    lead = f"I don't see a card called \"{query}\"." if query else "Which card?"
    return f"{lead} Your cards: {card_names(cards)}."


# ---------- replies ----------

def _due(card):
    return f"due {nice_date(card['due'])}" if card.get("due") else "nothing due"


def wallet_line(card):
    return (f"{card.get('name', '?')}: {money(card.get('balance'))} of {money(card.get('limit'))} "
            f"({percent(card.get('usage'))} used), {apr(card.get('apr'))}, {_due(card)}")


def format_wallet(wallet):
    cards = wallet.get("cards") or []
    if not cards:
        return "I don't see any cards yet."
    lines = [f"- {wallet_line(c)}" for c in cards]
    guard = "on" if (wallet.get("settings") or {}).get("debt_guard") else "off"
    total = (f"Total: {money(wallet.get('total_balance'))} of {money(wallet.get('total_limit'))} "
             f"({percent(wallet.get('usage'))} used). Debt Guard is {guard}.")
    return "Your cards:\n" + "\n".join(lines) + "\n" + total


def _usage_tip(tip):
    """planner.usage_tip(): {pay, before, target, ...} or None."""
    if isinstance(tip, str) and tip:
        return tip
    if isinstance(tip, dict):
        return (f"Pay {money(tip.get('pay'))} before {nice_date(tip.get('before'))} to report "
                f"usage under {percent(tip.get('target'))}.")
    return "Usage is low, so there's nothing extra to pay before the statement closes."


def format_card(card):
    fee = card.get("annual_fee")
    fee_text = "No annual fee." if not fee else f"{money(fee)} annual fee."
    ending = f" (ending {card['last4']})" if card.get("last4") else ""
    label = f": {card['label']}." if card.get("label") else "."
    return (f"{card.get('name', '?')}{ending}{label}\n"
            f"{money(card.get('balance'))} of {money(card.get('limit'))} "
            f"({percent(card.get('usage'))} used), {apr(card.get('apr'))}, {_due(card)}. "
            f"{fee_text} {money(card.get('rewards_ytd'))} in rewards this year.\n"
            f"{_usage_tip(card.get('usage_tip'))}")


def _months(n):
    if n is None:
        return f"{MISSING} months"
    if n == 1:
        return "1 month"
    if n >= 12:
        return f"{n} months (about {n / 12:.1f} years)"
    return f"{n} months"


def format_payback(card, plan):
    """GET /api/payback/<card>: pay in full vs. minimum only."""
    name = card.get("name", "That card")
    if not plan.get("balance"):
        return f"{name} has no balance, so there's nothing to pay off."
    full, minimum = plan.get("pay_in_full") or {}, plan.get("minimum_only") or {}
    return (f"{name}: {money(plan.get('balance'))} at {apr(plan.get('apr'))}.\n"
            f"- Pay in full: {_months(full.get('months'))}, {money(full.get('interest'))} interest.\n"
            f"- Minimum only: {_months(minimum.get('months'))}, {money(minimum.get('interest'))} interest.")


KEEP_OPEN = ("keep the account open: closing it can shorten your credit history and raise "
             "your usage. This is advice only, so I won't change anything.")


def format_fee_check(data):
    """The annual_fee notification's data: fee, value earned, net, worth_it,
    no_fee_version, fee_date. Advice only, nothing to approve."""
    name, when = data.get("name", "This card"), nice_date(data.get("fee_date"))
    net = data.get("net")
    gap = money(abs(net)) if net is not None else MISSING
    head = (f"{name}'s {money(data.get('fee'))} annual fee comes up {when}. "
            f"It earned you {money(data.get('value'))} this year")
    if data.get("worth_it"):
        return f"{head}, {gap} more than the fee, so it's paying for itself."
    switch = (f"Switch to {data['no_fee_version']} (no annual fee) before {when}"
              if data.get("no_fee_version") else f"Ask about a no-fee version before {when}")
    return f"{head}, {gap} less than the fee, so it isn't paying for itself. {switch}, and {KEEP_OPEN}"


def format_no_fee_check(card):
    if not card.get("annual_fee"):
        return f"{card.get('name', 'That card')} has no annual fee."
    return (f"{card.get('name', 'That card')}'s {money(card.get('annual_fee'))} annual fee isn't "
            "coming up soon, so there's nothing to decide yet.")
