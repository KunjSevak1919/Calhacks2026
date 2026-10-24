"""One place that ties the engine together. Used by the Flask API and the agents."""
from datetime import date

from . import coach, data, planner, resolver, scorer
from .nessie import load_profile


class PocketPilot:
    def __init__(self, profile=None, today=None):
        self.profile = profile or load_profile()
        self.today = today or data.parse_date(self.profile.get("today")) or date.today()
        self.settings = {"debt_guard": False}
        self.approved = []
        self.dismissed = set()

    # ----- reads -----
    @property
    def cards(self):
        return [c for c in data.cards() if c["id"] in self.profile["accounts"]]

    def wallet(self):
        accts = self.profile["accounts"]
        out = []
        for c in self.cards:
            a = accts[c["id"]]
            out.append({
                "id": c["id"], "name": c["name"], "last4": c["last4"], "color": c["color"],
                "text_color": c["text_color"], "label": c["label"], "balance": a["balance"],
                "limit": a["limit"], "usage": round(a["balance"] / a["limit"], 3) if a["limit"] else 0,
                "apr": scorer.effective_apr(c, self.today), "due": a.get("due"),
                "annual_fee": c.get("annual_fee", 0), "rewards_ytd": a.get("rewards_ytd", 0),
                "usage_tip": planner.usage_tip(c, a)})
        total = sum(x["balance"] for x in out)
        limit = sum(x["limit"] for x in out)
        return {"cards": out, "total_balance": total, "total_limit": limit,
                "usage": round(total / limit, 3) if limit else 0,
                "impact": self.profile.get("impact", {}), "settings": self.settings,
                "source": self.profile.get("source", "demo")}

    # ----- the main decision -----
    def pick(self, merchant=None, amount=0.0, mcc=None, place_types=None, domain=None,
             foreign=False, debt_guard=None, explain=True):
        guard = self.settings["debt_guard"] if debt_guard is None else debt_guard
        store = resolver.resolve(merchant=merchant, mcc=mcc, place_types=place_types,
                                 domain=domain, history=self.profile.get("history"))
        category = store["category"]
        uncertain = resolver.is_uncertain(store)
        if uncertain:
            category = "unknown"   # play safe: flat-rate card wins
        purchase = {"amount": float(amount), "category": category,
                    "label": store["label"], "foreign": foreign}
        ranked = scorer.rank(self.cards, self.profile["accounts"], purchase, guard, self.today)
        best = ranked[0]
        template = scorer.reason(best, ranked, purchase, guard)
        if uncertain:
            template = (f"Not sure what kind of store this is, so {best['name']} is the safe pick "
                        f"({best['rate_label']}). Tell us the store type for a better pick.")
        why = coach.explain_pick(best, ranked, purchase, guard, template) if explain else template
        return {"store": store, "uncertain": uncertain, "debt_guard": guard,
                "best": best, "ranked": ranked, "reason": why}

    def notifications(self):
        """Alerts still waiting for the user. Approved or dismissed ones never come back."""
        done = {r["id"] for r in self.approved} | self.dismissed
        return [n for n in planner.notifications(self.cards, self.profile, self.today)
                if n["id"] not in done]

    def payback(self, card_id):
        c = data.card_by_id(card_id)
        a = self.profile["accounts"][card_id]
        return planner.payback(a["balance"], scorer.effective_apr(c, self.today))

    def coach_context(self):
        w = self.wallet()
        return {"today": self.today, "cards": w["cards"], "total_usage": w["usage"],
                "payday": self.profile.get("payday"), "checking": self.profile.get("checking_balance"),
                "due_soon": planner.due_soon(self.cards, self.profile["accounts"], self.today,
                                             self.profile.get("payday"), self.profile.get("checking_balance", 0)),
                "annual_fees": planner.annual_fee_checks(self.cards, self.profile["accounts"], self.today),
                "subscriptions": self.profile.get("subscriptions", []),
                "recently_opened": [k for k, a in self.profile["accounts"].items() if a.get("opened")]}

    def ask(self, question, history=None):
        return coach.ask(question, self.coach_context(), history)

    # ----- actions (always user-approved) -----
    def approve(self, notification_id):
        note = next((n for n in self.notifications() if n["id"] == notification_id), None)
        if note is None:
            return None
        d = note["data"]
        if note["kind"] == "due":
            msg = f"Scheduled ${d['suggested']:,.0f} to {d['name']} on {data.nice_date(d['pay_on'])}"
        elif note["kind"] == "subscription":
            msg = f"Canceled {d['name']}, saving ${d['amount']:.2f} a month"
            self.profile["subscriptions"] = [s for s in self.profile["subscriptions"] if s["id"] != d["id"]]
        else:
            msg = "Got it"
        record = {"id": notification_id, "kind": note["kind"], "message": msg}
        self.approved.append(record)
        return record

    def dismiss(self, notification_id):
        """'Later' / 'Keep it': hide the alert for this session without acting."""
        if not any(n["id"] == notification_id for n in self.notifications()):
            return None
        self.dismissed.add(notification_id)
        return {"id": notification_id, "message": "Dismissed"}
