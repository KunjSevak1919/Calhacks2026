"""Create the demo student in Capital One's Nessie sandbox.

Run once after you put NESSIE_API_KEY in ../.env (repo root):
    python scripts/seed_nessie.py
It prints a NESSIE_CUSTOMER_ID to put in your .env.

Note: written against Nessie's documented endpoints but not run yet
(our build machine had no network access to Nessie). Test it first.
"""
import os
import sys

from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from pocketpilot import data  # noqa: E402
from pocketpilot.nessie import Nessie  # noqa: E402

ADDRESS = {"street_number": "1", "street_name": "Washington Sq", "city": "San Jose",
           "state": "CA", "zip": "95192"}

MERCHANTS = [
    # Nessie rejects a list here ("category: str type expected").
    ("Whole Foods Market", "grocery", 37.3352, -121.8811),
    ("Shell", "gas", 37.3301, -121.8890),
    ("Chipotle", "dining", 37.3365, -121.8850),
    ("Target", "discount store", 37.3270, -121.8860),
]


def main():
    n = Nessie()
    if not n.enabled:
        sys.exit("Set NESSIE_API_KEY first.")
    profile = data.demo_user()
    cust = n._post("/customers", {"first_name": "Demo", "last_name": "Student", "address": ADDRESS})
    cust_id = cust["objectCreated"]["_id"]
    merchant_ids = {}
    for name, category, lat, lng in MERCHANTS:
        m = n._post("/merchants", {"name": name, "category": category, "address": ADDRESS,
                                   "geocode": {"lat": lat, "lng": lng}})
        merchant_ids[name] = m["objectCreated"]["_id"]
    for card in data.cards():
        acct = profile["accounts"][card["id"]]
        a = n._post(f"/customers/{cust_id}/accounts", {
            "type": "Credit Card", "nickname": card["name"], "rewards": 0,
            "balance": int(acct["balance"])})
        print(f"  {card['name']}: {a['objectCreated']['_id']}")
    print(f"\nNESSIE_CUSTOMER_ID={cust_id}")
    print("Merchants:", merchant_ids)


if __name__ == "__main__":
    main()
