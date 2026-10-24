"""x402 earnings/spending log and the paying wallet's spending cap.

Two append-only JSON-lines files in the ledger dir (default agents/.x402/,
gitignored): earned.jsonl (written by x402_server.py when a payment to us
settles) and spent.jsonl (written by whoever pays: Merchant Resolver, or the
demo client in its own sub-folder). Separate files, so the server and the
resolver -- separate processes -- never write the same file. Chat reads both.

SpendGuard counts a payment against the cap the moment we agree to sign it,
before we know whether it settled: the conservative choice, since a signed
authorization can move money. Settled payments are marked with their tx hash.

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

    def record_signed(self, endpoint, usd, network=None):
        """A payment we agreed to sign. Counts against the cap from now on."""
        pid = uuid.uuid4().hex[:12]
        self._append(SPENT_FILE, {"type": "signed", "id": pid, "at": self._clock().isoformat(),
                                  "endpoint": endpoint, "usd": str(usd), "network": network})
        return pid

    def record_result(self, pid, settled, tx=None, error=None):
        self._append(SPENT_FILE, {"type": "result", "id": pid, "at": self._clock().isoformat(),
                                  "settled": bool(settled), "tx": tx, "error": error})

    def record_blocked(self, endpoint, usd, reason):
        self._append(SPENT_FILE, {"type": "blocked", "at": self._clock().isoformat(),
                                  "endpoint": endpoint, "usd": None if usd is None else str(usd),
                                  "reason": reason})

    def signed_today_usd(self):
        today = self._clock().date().isoformat()
        return sum((Decimal(e["usd"]) for e in self._read(SPENT_FILE)
                    if e.get("type") == "signed" and e.get("at", "").startswith(today)), Decimal(0))

    def totals(self):
        """Everything chat needs: earned, spent (settled), today's signed total."""
        earned = self._read(EARNED_FILE)
        spent = self._read(SPENT_FILE)
        settled_ids = {e["id"]: e for e in spent if e.get("type") == "result" and e.get("settled")}
        signed = [e for e in spent if e.get("type") == "signed"]
        settled = [e for e in signed if e["id"] in settled_ids]
        return {
            "earned_usd": sum((Decimal(e["usd"]) for e in earned), Decimal(0)),
            "earned_count": len(earned),
            "spent_usd": sum((Decimal(e["usd"]) for e in settled), Decimal(0)),
            "spent_count": len(settled),
            "signed_today_usd": self.signed_today_usd(),
            "blocked_count": sum(1 for e in spent if e.get("type") == "blocked"),
            "last_earned_tx": next((e.get("tx") for e in reversed(earned) if e.get("tx")), None),
            "last_spent_tx": next((settled_ids[e["id"]].get("tx") for e in reversed(settled)
                                   if settled_ids[e["id"]].get("tx")), None),
        }


class SpendGuard:
    """Hard caps for the paying wallet: a per-call max and a per-UTC-day cap.
    reserve() is the only way to get permission to sign, and it's atomic
    (one lock), so two payments at once can't both squeeze under the cap."""

    def __init__(self, ledger, daily_cap_usd, max_per_call_usd):
        self.ledger = ledger
        self.daily_cap = Decimal(daily_cap_usd)
        self.max_per_call = Decimal(max_per_call_usd)
        self._lock = threading.Lock()

    def check(self, usd):
        """(ok, reason) without recording anything."""
        usd = Decimal(usd)
        if usd > self.max_per_call:
            return False, f"price ${usd} is over the per-call max ${self.max_per_call}"
        spent = self.ledger.signed_today_usd()
        if spent + usd > self.daily_cap:
            return False, (f"over daily cap: spent ${spent} of ${self.daily_cap} today, "
                           f"this call needs ${usd}")
        return True, ""

    def reserve(self, endpoint, usd, network=None):
        """Returns (payment_id, None) if allowed, else (None, reason). A
        refusal is logged to the ledger too, so chat can say how many."""
        with self._lock:
            ok, reason = self.check(usd)
            if not ok:
                self.ledger.record_blocked(endpoint, usd, reason)
                return None, reason
            return self.ledger.record_signed(endpoint, usd, network), None

    def remaining_today(self):
        return max(self.daily_cap - self.ledger.signed_today_usd(), Decimal(0))
