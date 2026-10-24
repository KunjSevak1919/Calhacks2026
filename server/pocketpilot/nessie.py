"""Capital One Nessie client.

Nessie gives us fake customers, credit card accounts, merchants and purchases.
It does not know APRs or reward rules, so we join its accounts to cards.json
by nickname (the account nickname must equal the card name, e.g. "Aurum Gold").

If NESSIE_API_KEY is not set, or Nessie is unreachable, we fall back to
data/demo_user.json so the app always runs.
"""
import os
import re

import requests

from . import data

BASE = "https://api.nessieisreal.com"
TIMEOUT = 8
_KEY_PARAM = re.compile(r"(key=)[^&\s'\"]+")


def scrub(text, key=None):
    """Remove the API key from a URL or error message before it is shown."""
    text = _KEY_PARAM.sub(r"\1***", str(text))
    return text.replace(key, "***") if key else text


class Nessie:
    def __init__(self, key=None):
        self.key = key or os.getenv("NESSIE_API_KEY")

    @property
    def enabled(self):
        return bool(self.key)

    def _request(self, method, path, **kw):
        try:
            r = requests.request(method, f"{BASE}{path}", params={"key": self.key},
                                 timeout=TIMEOUT, **kw)
            r.raise_for_status()
        except requests.RequestException as e:
            # requests puts the full URL (with ?key=...) in its messages; never leak it.
            raise type(e)(scrub(e, self.key), response=e.response) from None
        return r.json()

    def _get(self, path):
        return self._request("GET", path)

    def _post(self, path, body):
        return self._request("POST", path, json=body)

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
            # Skip accounts we have no limit/due-date info for, or the wallet would crash.
            if not card_id or card_id not in profile["accounts"]:
                continue
            # Nessie stores balance; keep limits, due dates etc. from the demo file.
            profile["accounts"][card_id]["balance"] = float(acct["balance"])
            profile["accounts"][card_id]["nessie_id"] = acct["_id"]
            for p in client.purchases(acct["_id"])[-25:]:
                m = client.merchant(p["merchant_id"])
                cats = m.get("category") or []
                history.append({"merchant": m.get("name"),
                                "categories": [cats] if isinstance(cats, str) else list(cats)})
        profile["nessie_history"] = history
        profile["source"] = "nessie"
    except requests.RequestException as e:
        profile["source"] = f"demo (Nessie unavailable: {e.__class__.__name__})"
    return profile
