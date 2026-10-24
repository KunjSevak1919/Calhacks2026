"""Capital One Nessie client.

Nessie gives us fake customers, credit card accounts, merchants and purchases.
It does not know APRs or reward rules, so we join its accounts to cards.json
by nickname (the account nickname must equal the card name, e.g. "Aurum Gold").

If NESSIE_API_KEY is not set, or Nessie is unreachable, we fall back to
data/demo_user.json so the app always runs.
"""
import os

import requests

from . import data

BASE = "http://api.nessieisreal.com"
TIMEOUT = 8


class Nessie:
    def __init__(self, key=None):
        self.key = key or os.getenv("NESSIE_API_KEY")

    @property
    def enabled(self):
        return bool(self.key)

    def _get(self, path):
        r = requests.get(f"{BASE}{path}", params={"key": self.key}, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()

    def _post(self, path, body):
        r = requests.post(f"{BASE}{path}", params={"key": self.key}, json=body, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()

    def accounts(self, customer_id):
        return self._get(f"/customers/{customer_id}/accounts")

    def purchases(self, account_id):
        return self._get(f"/accounts/{account_id}/purchases")

    def merchant(self, merchant_id):
        return self._get(f"/merchants/{merchant_id}")

    def create_purchase(self, account_id, merchant_id, amount, description, date):
        return self._post(f"/accounts/{account_id}/purchases", {
            "merchant_id": merchant_id, "medium": "balance", "purchase_date": date,
            "amount": amount, "status": "pending", "description": description})


def load_profile(customer_id=None):
    """Return the user profile, from Nessie when possible, else the demo file."""
    profile = data.demo_user()
    profile["source"] = "demo"
    client = Nessie()
    customer_id = customer_id or os.getenv("NESSIE_CUSTOMER_ID")
    if not (client.enabled and customer_id):
        return profile
    try:
        by_name = {c["name"].lower(): c["id"] for c in data.cards()}
        history = []
        for acct in client.accounts(customer_id):
            if acct.get("type") != "Credit Card":
                continue
            card_id = by_name.get(acct.get("nickname", "").lower())
            if not card_id:
                continue
            # Nessie stores balance; keep limits, due dates etc. from the demo file.
            profile["accounts"].setdefault(card_id, {})["balance"] = float(acct["balance"])
            profile["accounts"][card_id]["nessie_id"] = acct["_id"]
            for p in client.purchases(acct["_id"])[-25:]:
                m = client.merchant(p["merchant_id"])
                history.append({"merchant": m.get("name"), "categories": m.get("category", [])})
        profile["nessie_history"] = history
        profile["source"] = "nessie"
    except requests.RequestException as e:
        profile["source"] = f"demo (Nessie unavailable: {e.__class__.__name__})"
    return profile
