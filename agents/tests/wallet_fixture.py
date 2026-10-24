"""Trimmed copy of a real GET /api/wallet response (demo profile), plus one
card with a usage_tip, which the demo data doesn't produce on its own."""

WALLET = {
    "cards": [
        {"id": "aurum", "name": "Aurum Gold", "last4": "4021", "label": "4x points on groceries",
         "balance": 640.0, "limit": 5000.0, "usage": 0.128, "apr": 29.9, "due": "2026-10-30",
         "annual_fee": 0, "rewards_ytd": 112.0, "usage_tip": None},
        {"id": "steady", "name": "Steady 2%", "last4": "7730", "label": "2% back everywhere",
         "balance": 310.0, "limit": 3000.0, "usage": 0.103, "apr": 24.9, "due": "2026-11-12",
         "annual_fee": 0, "rewards_ytd": 64.0, "usage_tip": None},
        {"id": "zero", "name": "Zero Intro", "last4": "1185", "label": "1.5% back, 0% APR to Jun 2027",
         "balance": 0.0, "limit": 4000.0, "usage": 0.0, "apr": 0.0, "due": None,
         "annual_fee": 0, "rewards_ytd": 0.0, "usage_tip": None},
        {"id": "spin", "name": "Spin 5%", "last4": "5502", "label": "5% on gas this quarter",
         "balance": 370.0, "limit": 2500.0, "usage": 0.148, "apr": 26.2, "due": "2026-11-08",
         "annual_fee": 0, "rewards_ytd": 38.0, "usage_tip": None},
        {"id": "voyager", "name": "Voyager", "last4": "9318", "label": "3x on travel, $95 a year",
         "balance": 820.0, "limit": 10000.0, "usage": 0.082, "apr": 27.4, "due": "2026-11-04",
         "annual_fee": 95, "rewards_ytd": 41.0, "usage_tip": None},
    ],
    "total_balance": 2140.0, "total_limit": 24500.0, "usage": 0.087,
    "settings": {"debt_guard": False}, "source": "demo",
}

# Same shape planner.usage_tip() returns when usage is over 30%.
HIGH_USAGE_CARD = {
    "id": "spin", "name": "Spin 5%", "last4": "5502", "label": "5% on gas this quarter",
    "balance": 1200.0, "limit": 2500.0, "usage": 0.48, "apr": 26.2, "due": "2026-11-08",
    "annual_fee": 0, "rewards_ytd": 38.0,
    "usage_tip": {"card_id": "spin", "usage": 0.48, "pay": 450.0, "before": "2026-11-01", "target": 0.3},
}

# Real GET /api/payback/aurum response.
PAYBACK_AURUM = {"apr": 29.9, "balance": 640.0,
                 "minimum_only": {"interest": 391.85, "months": 42},
                 "pay_in_full": {"interest": 0.0, "months": 1}}

# Real annual_fee notification from GET /api/notifications.
FEE_VOYAGER_NOTE = {
    "id": "fee-voyager", "kind": "annual_fee", "priority": 3,
    "title": "Is your $95 Voyager fee worth it?",
    "body": ("It earned you $41 this year. Switch to Voyager Basic before Nov 15 and keep the "
             "account open to protect your credit history."),
    "actions": ["See options", "Ask Coach"],
    "data": {"card_id": "voyager", "days": 23, "fee": 95, "fee_date": "2026-11-15", "name": "Voyager",
             "net": -54.0, "no_fee_version": "Voyager Basic", "value": 41.0, "worth_it": False},
}
