"""Visa Flexible Credential (VFC) rule engine -- SIMULATED.

VFC is a real Visa capability: one card where the issuer bank lets the user
switch how a purchase is funded (credit, debit, installments, points),
chosen by rules the user sets in their bank app, applied by Visa's
preference engine at authorization. It's issuer-bank-only -- there is no
public API to call -- so this module simulates the decision layer only.
Deterministic, no LLM, and it reuses the existing resolver (store ->
category) and scorer (card ranking) rather than duplicating their logic, so
the real merchant category is always kept. That's the point: people don't
know which funding option is cheapest, so Pocket Pilot writes and applies
the rules for them -- unlike Curve, which routed everything through itself
and lost category bonuses in the process.
"""
from datetime import timedelta

from . import data, planner, resolver, scorer

DEFAULT_DEBIT_BUFFER = 100.0
DEFAULT_INSTALLMENT_THRESHOLD = 200.0
INSTALLMENT_COUNT = 4
INSTALLMENT_INTERVAL_DAYS = 14

RULE_CREDIT_IF_CLEAR = "credit-if-clear"
RULE_DEBIT_IF_CARRYING = "debit-if-carrying"
RULE_INSTALLMENTS_IF_LARGE = "installments-if-large"
RULE_CREDIT_LOWEST_APR = "credit-lowest-apr-otherwise"


def generate_rules(profile, cards, settings):
    """An ordered, plain-English rulebook for this student. Doesn't need a
    specific purchase in hand -- these are the standing rules VFC would
    apply to any purchase, with the student's current buffer/threshold
    settings baked into the wording."""
    buffer = settings.get("debit_buffer", DEFAULT_DEBIT_BUFFER)
    threshold = settings.get("installment_threshold", DEFAULT_INSTALLMENT_THRESHOLD)
    return [
        {"id": RULE_CREDIT_IF_CLEAR,
         "when": ("You can pay the purchase off in full, and your best rewards card isn't "
                   "already carrying a balance you can't clear"),
         "then": "Pay with CREDIT on your best rewards card for this store's category",
         "why": ("No interest when you pay in full, so you keep the full reward -- and the "
                   "real merchant category is kept, so category bonuses still apply.")},
        {"id": RULE_DEBIT_IF_CARRYING,
         "when": (f"You're carrying a balance (Debt Guard is on, or your best card can't be "
                   f"paid off right now), and checking can cover the purchase after a "
                   f"${buffer:,.0f} safety buffer"),
         "then": "Pay with DEBIT, straight from checking",
         "why": ("Credit would start charging interest today on a balance you're already "
                   "carrying -- debit costs $0 in interest.")},
        {"id": RULE_INSTALLMENTS_IF_LARGE,
         "when": f"The purchase is ${threshold:,.0f} or more, and debit can't safely cover it",
         "then": f"Split into {INSTALLMENT_COUNT} equal INSTALLMENTS, {INSTALLMENT_INTERVAL_DAYS} days apart",
         "why": ("This demo assumes 0% interest and no fees on installments, so spreading out "
                   "a big purchase costs nothing extra and keeps you off high-APR credit.")},
        {"id": RULE_CREDIT_LOWEST_APR,
         "when": ("None of the above -- you're carrying a balance, debit can't cover it, and "
                   "the purchase is below the installment threshold"),
         "then": "Pay with CREDIT on your lowest-cost card for this balance",
         "why": "If credit is the only option while carrying a balance, the lowest-APR card costs you the least."},
    ]


def _resolve_store(merchant, mcc, profile):
    store = resolver.resolve(merchant=merchant, mcc=mcc, history=profile.get("history"))
    uncertain = resolver.is_uncertain(store)
    category = "unknown" if uncertain else store["category"]
    return store, category


def _best_card_unpayable(best, due_soon_items):
    """True if the best rewards card has a due-soon balance it can't be
    fully paid off right now (suggested < balance) -- i.e. it's genuinely
    carrying a balance, not just one that's already fully budgeted for."""
    item = next((d for d in due_soon_items if d["card_id"] == best["card_id"]), None)
    return bool(item) and item["suggested"] < item["balance"]


def _already_scheduled(due_soon_items, today):
    """Money due to leave checking today or earlier -- not amounts that are
    budgeted against the *next* paycheck, which due_soon() already assumes."""
    return sum(d["suggested"] for d in due_soon_items if data.parse_date(d["pay_on"]) <= today)


def authorize(purchase, rules, profile, cards, settings, today):
    """purchase: {merchant?, mcc?, amount}. rules: generate_rules()'s output
    (not re-derived here, but kept so the API surface matches the rulebook
    the student was shown). Returns the simulated funding decision."""
    merchant, mcc = purchase.get("merchant"), purchase.get("mcc")
    amount = float(purchase["amount"])
    store, category = _resolve_store(merchant, mcc, profile)
    accounts = profile["accounts"]
    p = {"amount": amount, "category": category, "label": store["label"], "foreign": False}

    due_soon_items = planner.due_soon(cards, accounts, today, profile.get("payday"),
                                       profile.get("checking_balance", 0.0))

    ranked_no_guard = scorer.rank(cards, accounts, p, False, today)
    best_rewards = ranked_no_guard[0]

    debt_guard = bool(settings.get("debt_guard", False))
    carrying_balance = debt_guard or _best_card_unpayable(best_rewards, due_soon_items)

    base = {"merchant": store["merchant"] or merchant, "mcc": store["mcc"] or mcc,
            "category": category, "mcc_preserved": True, "simulated": True}

    if not carrying_balance:
        best = best_rewards
        reason = (f"Pay with credit on {best['name']}: you can pay this off in full, so it "
                  f"earns ${best['reward']:.2f} ({best['rate_label']}) with no interest.")
        return {**base, "funding": "credit", "card_id": best["card_id"], "card_name": best["name"],
                "rule_id": RULE_CREDIT_IF_CLEAR, "reason": reason}

    buffer = float(settings.get("debit_buffer", DEFAULT_DEBIT_BUFFER))
    threshold = float(settings.get("installment_threshold", DEFAULT_INSTALLMENT_THRESHOLD))
    checking = float(profile.get("checking_balance", 0.0))
    scheduled = _already_scheduled(due_soon_items, today)
    available_for_debit = checking - buffer - scheduled

    if amount <= available_for_debit:
        scheduled_clause = f", minus ${scheduled:,.2f} already scheduled today" if scheduled else ""
        reason = (f"Pay with debit: you're carrying a balance, so credit would start charging "
                  f"interest today -- debit costs $0. Checking has ${checking:,.2f}{scheduled_clause}, "
                  f"minus a ${buffer:,.2f} safety buffer, leaves ${available_for_debit:,.2f} -- "
                  f"enough for ${amount:,.2f}.")
        return {**base, "funding": "debit", "card_id": None, "card_name": None,
                "rule_id": RULE_DEBIT_IF_CARRYING, "reason": reason}

    if amount >= threshold:
        each = round(amount / INSTALLMENT_COUNT, 2)
        amounts = [each] * (INSTALLMENT_COUNT - 1)
        amounts.append(round(amount - sum(amounts), 2))  # exact total, no rounding leak
        dates = [today + timedelta(days=INSTALLMENT_INTERVAL_DAYS * i) for i in range(INSTALLMENT_COUNT)]
        schedule = [{"date": d.isoformat(), "amount": a} for d, a in zip(dates, amounts)]
        reason = (f"Split into {INSTALLMENT_COUNT} payments of ${each:,.2f} every "
                  f"{INSTALLMENT_INTERVAL_DAYS} days: ${amount:,.2f} is a big purchase and only "
                  f"${max(available_for_debit, 0):,.2f} is safely available for debit right now. "
                  "This demo assumes 0% interest and no fees on installments.")
        return {**base, "funding": "installments", "card_id": None, "card_name": None,
                "installments": {"count": INSTALLMENT_COUNT, "each": each, "schedule": schedule},
                "rule_id": RULE_INSTALLMENTS_IF_LARGE, "reason": reason}

    ranked_guard = scorer.rank(cards, accounts, p, True, today)
    best = ranked_guard[0]
    reason = (f"Pay with credit on {best['name']}: you're carrying a balance and debit can't "
              f"cover ${amount:,.2f} right now, and it's below the ${threshold:,.0f} "
              f"installment threshold. {best['name']}'s {best['apr']:g}% APR keeps the cost "
              f"lowest: ${best['interest']:.2f} in interest over 3 months.")
    return {**base, "funding": "credit", "card_id": best["card_id"], "card_name": best["name"],
            "rule_id": RULE_CREDIT_LOWEST_APR, "reason": reason}
