"""Rank cards by what the user actually keeps on a purchase.

true value = rewards - expected interest (Debt Guard) - fees - credit-score penalty

Plain Python on purpose: it must be fast, predictable and testable.
Claude only explains the result; it never decides it.
"""
from . import data

CARRY_MONTHS = 3            # Debt Guard assumes a carried purchase sits ~3 months
UTILIZATION_TARGET = 0.30   # above this, reported usage starts to hurt a score
UTILIZATION_PENALTY = 0.01  # tie-breaker, per $ of purchase, for pushing a card over 30%


def effective_apr(card, today):
    intro = card.get("intro_apr")
    if intro and data.parse_date(intro["until"]) >= today:
        return intro["rate"]
    return card["apr"]


def reward_rate(card, category, today, amount):
    """Return (cash_value, rate_label) for this purchase on this card."""
    base = card["base_rate"]
    rot = card.get("rotating")
    if (rot and rot.get("activated") and rot["category"] == category
            and data.parse_date(rot["ends"]) >= today and rot["cap_remaining"] > 0):
        bonus_part = min(amount, rot["cap_remaining"])
        value = bonus_part * rot["rate"] + (amount - bonus_part) * base
        return value, f"{rot['rate'] * 100:g}% on {category} this quarter"
    if category in card.get("categories", {}):
        rate = card["categories"][category]
        return amount * rate, f"{rate * 100:g}% on {category}"
    return amount * base, f"{base * 100:g}% base"


def score_card(card, account, purchase, debt_guard, today):
    amount = purchase["amount"]
    category = purchase.get("category", "unknown")
    reward, rate_label = reward_rate(card, category, today, amount)

    apr = effective_apr(card, today)
    interest = amount * apr / 100 / 12 * CARRY_MONTHS if debt_guard else 0.0
    fee = amount * card.get("foreign_fee", 0) if purchase.get("foreign") else 0.0

    balance, limit = account["balance"], account["limit"]
    available = limit - balance
    new_usage = (balance + amount) / limit if limit else 1.0
    warnings = []
    eligible = amount <= available
    if not eligible:
        warnings.append("Not enough credit left on this card")
    penalty = 0.0
    if eligible and new_usage > UTILIZATION_TARGET:
        penalty = amount * UTILIZATION_PENALTY
        warnings.append(f"Would push usage to {new_usage:.0%}, which can hurt your score")

    bonus = card.get("signup_bonus")
    bonus_note = None
    if bonus and data.parse_date(bonus["deadline"]) >= today:
        left = max(0.0, bonus["spend_required"] - bonus["spent"])
        if left > 0:
            bonus_note = f"Counts toward your ${bonus['value']:g} sign-up bonus: ${left:,.0f} left by {data.nice_date(bonus['deadline'])}"

    net = reward - interest - fee - penalty
    return {
        "card_id": card["id"], "name": card["name"], "last4": card["last4"],
        "eligible": eligible, "net": round(net, 2), "reward": round(reward, 2),
        "interest": round(interest, 2), "fee": round(fee, 2), "penalty": round(penalty, 2),
        "apr": apr, "rate_label": rate_label, "new_usage": round(new_usage, 3),
        "warnings": warnings, "bonus_note": bonus_note,
    }


def rank(cards, accounts, purchase, debt_guard, today):
    """Score every card, best first. Ineligible cards go last."""
    scored = [score_card(c, accounts[c["id"]], purchase, debt_guard, today)
              for c in cards if c["id"] in accounts]
    return sorted(scored, key=lambda s: (s["eligible"], s["net"]), reverse=True)


def reason(best, ranked, purchase, debt_guard):
    """Plain-language reason, built from numbers only. Claude may reword it."""
    label = purchase.get("label") or purchase.get("category", "this store")
    if debt_guard:
        top_reward = max(ranked, key=lambda s: s["reward"])
        if top_reward["card_id"] != best["card_id"]:
            return (f"You're carrying a balance. {top_reward['name']} would earn "
                    f"${top_reward['reward']:.2f}, but its {top_reward['apr']:g}% APR "
                    f"costs ${top_reward['interest']:.2f} over {CARRY_MONTHS} months. "
                    f"{best['name']} keeps you ahead: ${best['net']:.2f}.")
    return (f"{label}: {best['name']} earns {best['rate_label']}, "
            f"${best['reward']:.2f} back, the most of your {len(ranked)} cards.")
