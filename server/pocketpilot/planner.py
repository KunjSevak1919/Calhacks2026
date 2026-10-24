"""Proactive money checks: due dates, payback, usage, annual fees, credits, subscriptions.

Everything here returns plain data. The agents and the API turn it into
notifications; the user approves any action.
"""
from datetime import timedelta

from . import data
from .scorer import effective_apr

DUE_WINDOW_DAYS = 7
FEE_WINDOW_DAYS = 30
CREDIT_WINDOW_DAYS = 10


def monthly_interest(balance, apr):
    return balance * apr / 100 / 12


def payback(balance, apr, min_floor=25.0, min_pct=0.01, max_months=600):
    """Compare paying in full vs. paying only the minimum each month."""
    months, total_interest, b = 0, 0.0, balance
    while b > 0.005 and months < max_months:
        interest = monthly_interest(b, apr)
        payment = min(b + interest, max(min_floor, b * min_pct + interest))
        total_interest += interest
        b = b + interest - payment
        months += 1
    return {
        "balance": round(balance, 2), "apr": apr,
        "pay_in_full": {"months": 1 if balance else 0, "interest": 0.0},
        "minimum_only": {"months": months, "interest": round(total_interest, 2)},
    }


def usage_tip(card, account, target=0.30):
    """How much to pay before the statement closes to report usage under target."""
    limit = account["limit"]
    usage = account["balance"] / limit if limit else 0
    if usage <= target:
        return None
    pay = account["balance"] - target * limit
    return {"card_id": card["id"], "usage": round(usage, 3), "pay": round(pay, 2),
            "before": account["statement_close"], "target": target}


def due_soon(cards, accounts, today, payday, cash):
    """Cards due within a week, highest APR first, with a payday-aware date."""
    out = []
    for c in cards:
        a = accounts.get(c["id"])
        if not a or not a.get("due") or a["balance"] <= 0:
            continue
        due = data.parse_date(a["due"])
        days = (due - today).days
        if 0 <= days <= DUE_WINDOW_DAYS:
            apr = effective_apr(c, today)
            pay_day = data.parse_date(payday["next"]) if payday else None
            pay_on = pay_day + timedelta(days=1) if pay_day and pay_day < due else due - timedelta(days=1)
            out.append({"card_id": c["id"], "name": c["name"], "due": a["due"], "days": days,
                        "balance": a["balance"], "minimum": a["min_payment"], "apr": apr,
                        "pay_on": pay_on.isoformat(),
                        "interest_saved": round(monthly_interest(a["balance"], apr), 2)})
    out.sort(key=lambda x: x["apr"], reverse=True)
    # Can we cover the full balance with cash on hand + next paycheck?
    budget = cash + (payday["amount"] if payday else 0)
    for item in out:
        item["suggested"] = item["balance"] if budget >= item["balance"] else max(item["minimum"], budget)
        budget = max(0.0, budget - item["suggested"])
    return out


def annual_fee_checks(cards, accounts, today):
    out = []
    for c in cards:
        if not c.get("annual_fee") or not c.get("annual_fee_date"):
            continue
        fee_date = data.parse_date(c["annual_fee_date"])
        days = (fee_date - today).days
        if 0 <= days <= FEE_WINDOW_DAYS:
            a = accounts[c["id"]]
            credits_used = sum(cr["used"] for cr in c.get("credits", []))
            value = a.get("rewards_ytd", 0) + credits_used
            out.append({"card_id": c["id"], "name": c["name"], "fee": c["annual_fee"],
                        "fee_date": c["annual_fee_date"], "days": days,
                        "value": round(value, 2), "net": round(value - c["annual_fee"], 2),
                        "worth_it": value >= c["annual_fee"],
                        "no_fee_version": c.get("no_fee_version")})
    return out


def expiring_credits(cards, today):
    out = []
    for c in cards:
        for cr in c.get("credits", []):
            left = cr["amount"] - cr["used"]
            days = (data.parse_date(cr["expires"]) - today).days
            if left > 0 and 0 <= days <= CREDIT_WINDOW_DAYS:
                out.append({"card_id": c["id"], "card": c["name"], "credit": cr["name"],
                            "left": left, "expires": cr["expires"], "days": days})
    return out


def signup_progress(cards, today):
    out = []
    for c in cards:
        b = c.get("signup_bonus")
        if not b:
            continue
        left = b["spend_required"] - b["spent"]
        days = (data.parse_date(b["deadline"]) - today).days
        if left > 0 and days >= 0:
            out.append({"card_id": c["id"], "name": c["name"], "value": b["value"],
                        "left": left, "deadline": b["deadline"], "days": days})
    return out


def subscription_flags(subs, today):
    out = []
    for s in subs:
        days = (data.parse_date(s["next_charge"]) - today).days
        if s.get("trial") and 0 <= days <= 2:
            out.append({**s, "reason": "trial_ending", "days": days})
        elif s.get("last_used_days", 0) >= 30:
            out.append({**s, "reason": "unused", "days": days})
    return out


def notifications(cards, profile, today):
    """Build the lock-screen alerts, most urgent first."""
    accounts = profile["accounts"]
    notes = []
    for d in due_soon(cards, accounts, today, profile.get("payday"), profile.get("checking_balance", 0)):
        notes.append({
            "id": f"due-{d['card_id']}", "kind": "due", "priority": 1,
            "title": f"{d['name']} is due {data.nice_date(d['due'])}",
            "body": (f"Pay ${d['suggested']:,.0f} on {data.nice_date(d['pay_on'])}, after payday? "
                     f"It has a {d['apr']:g}% APR. Paying in full saves about "
                     f"${d['interest_saved']:.0f} in interest next month."),
            "actions": ["Approve", "Later"], "data": d})
    for s in subscription_flags(profile.get("subscriptions", []), today):
        if s["reason"] == "trial_ending":
            title, body = "Free trial converts tomorrow" if s["days"] == 1 else "Free trial ends soon", \
                f"{s['name']} starts charging ${s['amount']:.2f} on {data.nice_date(s['next_charge'])}. You haven't opened it in {s['last_used_days']} days."
            actions = ["Cancel trial", "Keep it"]
        else:
            title, body = f"Still using {s['name']}?", \
                f"${s['amount']:.2f} a month, not used in {s['last_used_days']} days."
            actions = ["Cancel", "Keep it"]
        notes.append({"id": f"sub-{s['id']}", "kind": "subscription", "priority": 2,
                      "title": title, "body": body, "actions": actions, "data": s})
    for f in annual_fee_checks(cards, accounts, today):
        if f["worth_it"]:
            continue
        alt = f" Switch to {f['no_fee_version']}" if f.get("no_fee_version") else " Ask about a no-fee version"
        notes.append({"id": f"fee-{f['card_id']}", "kind": "annual_fee", "priority": 3,
                      "title": f"Is your ${f['fee']:g} {f['name']} fee worth it?",
                      "body": (f"It earned you ${f['value']:.0f} this year.{alt} before "
                               f"{data.nice_date(f['fee_date'])} and keep the account open to protect your credit history."),
                      "actions": ["See options", "Ask Coach"], "data": f})
    for cr in expiring_credits(cards, today):
        notes.append({"id": f"credit-{cr['card_id']}", "kind": "credit", "priority": 4,
                      "title": f"${cr['left']:g} {cr['credit'].lower()} expires {data.nice_date(cr['expires'])}",
                      "body": f"Use your {cr['card']} for it before it's gone.",
                      "actions": ["Got it"], "data": cr})
    for b in signup_progress(cards, today):
        notes.append({"id": f"bonus-{b['card_id']}", "kind": "signup_bonus", "priority": 5,
                      "title": f"${b['left']:,.0f} to go for your ${b['value']:g} bonus",
                      "body": (f"Use {b['name']} for normal spending until {data.nice_date(b['deadline'])}. "
                               "Don't buy extra just to hit it."),
                      "actions": ["Got it"], "data": b})
    return sorted(notes, key=lambda n: n["priority"])
