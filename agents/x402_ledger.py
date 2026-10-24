"""x402 earnings/spending log and the paying wallet's spending cap.

Two append-only JSON-lines files in the ledger dir (default agents/.x402/,
gitignored): earned.jsonl (written by x402_server.py when a payment to us
settles) and spent.jsonl (written by whoever pays: Merchant Resolver, or the
demo client in its own sub-folder). Separate files, so the server and the
resolver -- separate processes -- never write the same file. Chat reads both.

Spending counts only once a settlement is confirmed (a receipt with a tx, or
the chain says the authorization was used). While a payment is in flight,
SpendGuard holds its amount in memory, so two payments at once can't both
squeeze under the cap; a payment that fails releases its hold and costs
nothing against the cap.

Amounts are Decimal dollars; rounding happens only when displayed.
"""
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from decimal import Decimal

EARNED_FILE = "earned.jsonl"
SPENT_FILE = "spent.jsonl"


def _now():
    return datetime.now(timezone.utc)


class Ledger:
    def __init__(self, ledger_dir, clock=_now):
        self.dir = ledger_dir
        self._clock = clock
        self._lock = threading.Lock()

    def _path(self, name):
        return os.path.join(self.dir, name)

    def _append(self, name, entry):
        with self._lock:
            os.makedirs(self.dir, exist_ok=True)
            with open(self._path(name), "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")

    def _read(self, name):
        try:
            with open(self._path(name), encoding="utf-8") as f:
                lines = f.readlines()
        except FileNotFoundError:
            return []
        out = []
        for line in lines:
            try:
                out.append(json.loads(line))
            except ValueError:
                continue  # a half-written line from a crash; skip it
        return out

    # ---- earning side (x402_server.py) ----

    def record_earned(self, endpoint, usd, tx=None, payer=None, network=None):
        self._append(EARNED_FILE, {"at": self._clock().isoformat(), "endpoint": endpoint,
                                   "usd": str(usd), "tx": tx, "payer": payer, "network": network})

    # ---- paying side (x402_payer.py) ----

    def record_spent(self, endpoint, usd, tx=None, network=None):
        """A payment confirmed settled. The only kind that counts."""
        self._append(SPENT_FILE, {"type": "spent", "at": self._clock().isoformat(), "endpoint": endpoint,
                                  "usd": str(usd), "tx": tx, "network": network})

    def record_failed(self, endpoint, usd, reason):
        """Signed but not settled: costs nothing, logged so we can see why."""
        self._append(SPENT_FILE, {"type": "failed", "at": self._clock().isoformat(), "endpoint": endpoint,
                                  "usd": None if usd is None else str(usd), "reason": reason})

    def record_blocked(self, endpoint, usd, reason):
        self._append(SPENT_FILE, {"type": "blocked", "at": self._clock().isoformat(),
                                  "endpoint": endpoint, "usd": None if usd is None else str(usd),
                                  "reason": reason})

    def _spent_entries(self):
        """Confirmed payments: "spent" entries, plus older "signed" entries
        that have a settled "result" (the format before 2026-10-24). A
        signed payment that never settled doesn't count."""
        entries = self._read(SPENT_FILE)
        settled = {e["id"]: e for e in entries if e.get("type") == "result" and e.get("settled")}
        out = []
        for e in entries:
            if e.get("type") == "spent":
                out.append(e)
            elif e.get("type") == "signed" and e.get("id") in settled:
                out.append({**e, "tx": settled[e["id"]].get("tx")})
        return out, entries

    def spent_today_usd(self):
        today = self._clock().date().isoformat()
        spent, _ = self._spent_entries()
        return sum((Decimal(e["usd"]) for e in spent if e.get("at", "").startswith(today)), Decimal(0))

    def totals(self):
        """Everything chat needs: earned, spent (confirmed), today's spending."""
        earned = self._read(EARNED_FILE)
        spent, entries = self._spent_entries()
        return {
            "earned_usd": sum((Decimal(e["usd"]) for e in earned), Decimal(0)),
            "earned_count": len(earned),
            "spent_usd": sum((Decimal(e["usd"]) for e in spent), Decimal(0)),
            "spent_count": len(spent),
            "spent_today_usd": self.spent_today_usd(),
            "blocked_count": sum(1 for e in entries if e.get("type") == "blocked"),
            "failed_count": sum(1 for e in entries if e.get("type") == "failed"),
            "last_earned_tx": next((e.get("tx") for e in reversed(earned) if e.get("tx")), None),
            "last_spent_tx": next((e.get("tx") for e in reversed(spent) if e.get("tx")), None),
        }


class SpendGuard:
    """Hard caps for the paying wallet: a per-call max and a per-UTC-day cap.

    reserve() puts a hold on the amount (in memory) if confirmed spending
    today + other holds + this price fits under the cap. Then exactly one of:
    confirm() -- settled, so it's written as spent -- or release() -- it
    didn't settle, so it's written as failed and costs nothing."""

    def __init__(self, ledger, daily_cap_usd, max_per_call_usd):
        self.ledger = ledger
        self.daily_cap = Decimal(daily_cap_usd)
        self.max_per_call = Decimal(max_per_call_usd)
        self._lock = threading.Lock()
        self._holds = {}  # hold id -> (endpoint, usd, network)

    def _held(self):
        return sum((usd for _, usd, _ in self._holds.values()), Decimal(0))

    def check(self, usd):
        """(ok, reason) without holding anything."""
        usd = Decimal(usd)
        if usd > self.max_per_call:
            return False, f"price ${usd} is over the per-call max ${self.max_per_call}"
        spent = self.ledger.spent_today_usd()
        held = self._held()
        if spent + held + usd > self.daily_cap:
            in_flight = f" (+${held} in flight)" if held else ""
            return False, (f"over daily cap: spent ${spent}{in_flight} of ${self.daily_cap} today, "
                           f"this call needs ${usd}")
        return True, ""

    def reserve(self, endpoint, usd, network=None):
        """Returns (hold_id, None) if allowed, else (None, reason). A refusal
        is logged to the ledger, so chat can say how many."""
        usd = Decimal(usd)
        with self._lock:
            ok, reason = self.check(usd)
            if not ok:
                self.ledger.record_blocked(endpoint, usd, reason)
                return None, reason
            hold = uuid.uuid4().hex[:12]
            self._holds[hold] = (endpoint, usd, network)
            return hold, None

    def confirm(self, hold, tx=None):
        with self._lock:
            endpoint, usd, network = self._holds.pop(hold)
            self.ledger.record_spent(endpoint, usd, tx=tx, network=network)

    def release(self, hold, reason):
        with self._lock:
            endpoint, usd, _ = self._holds.pop(hold)
            self.ledger.record_failed(endpoint, usd, reason)

    def remaining_today(self):
        return max(self.daily_cap - self.ledger.spent_today_usd() - self._held(), Decimal(0))
