import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from x402_ledger import Ledger, SpendGuard


class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.now


def make(tmp_path, cap="0.003", per_call="0.002"):
    clock = Clock()
    ledger = Ledger(str(tmp_path), clock=clock)
    return clock, ledger, SpendGuard(ledger, cap, per_call)


def pay(guard, usd="0.001", tx="0xtx"):
    hold, reason = guard.reserve("/x402/merchant-data", usd)
    assert hold, reason
    guard.confirm(hold, tx=tx)


def test_confirmed_payment_counts(tmp_path):
    _, ledger, guard = make(tmp_path)
    pay(guard)
    assert ledger.spent_today_usd() == Decimal("0.001")
    assert guard.remaining_today() == Decimal("0.002")


def test_failed_payments_never_count_against_the_cap(tmp_path):
    """The bug: two failed attempts took the cap from $0.049 to $0.048."""
    _, ledger, guard = make(tmp_path, cap="0.05", per_call="0.01")
    pay(guard)
    assert guard.remaining_today() == Decimal("0.049")
    for _ in range(2):
        hold, _ = guard.reserve("/x402/best-card", "0.001")
        guard.release(hold, "HTTP 402 payment_not_settled")
    assert guard.remaining_today() == Decimal("0.049")
    t = ledger.totals()
    assert t["spent_count"] == 1 and t["failed_count"] == 2


def test_in_flight_hold_counts_until_resolved(tmp_path):
    _, ledger, guard = make(tmp_path, cap="0.002")
    a, _ = guard.reserve("/x", "0.001")
    b, _ = guard.reserve("/x", "0.001")
    assert guard.reserve("/x", "0.001")[0] is None  # two in flight fill the cap
    assert ledger.spent_today_usd() == 0            # but nothing is spent yet
    guard.release(a, "failed")
    assert guard.reserve("/x", "0.001")[0] is not None  # room again


def test_daily_cap_blocks_payment_and_logs_why(tmp_path):
    _, ledger, guard = make(tmp_path)
    for _ in range(3):
        pay(guard)
    hold, reason = guard.reserve("/x402/merchant-data", "0.001")
    assert hold is None
    assert "over daily cap" in reason
    assert ledger.totals()["blocked_count"] == 1
    assert ledger.spent_today_usd() == Decimal("0.003")


def test_per_call_max_blocks_payment(tmp_path):
    _, _, guard = make(tmp_path)
    hold, reason = guard.reserve("/x402/merchant-data", "0.005")
    assert hold is None
    assert "per-call max" in reason


def test_cap_resets_next_utc_day(tmp_path):
    clock, _, guard = make(tmp_path)
    for _ in range(3):
        pay(guard)
    assert guard.reserve("/x", "0.001")[0] is None
    clock.now += timedelta(days=1)
    assert guard.reserve("/x", "0.001")[0] is not None


def test_totals(tmp_path):
    _, ledger, guard = make(tmp_path)
    pay(guard, tx="0xaaa")
    ledger.record_earned("/x402/best-card", Decimal("0.001"), tx="0xeee", payer="0xp")
    t = ledger.totals()
    assert t["spent_usd"] == Decimal("0.001") and t["spent_count"] == 1
    assert t["earned_usd"] == Decimal("0.001") and t["earned_count"] == 1
    assert t["last_spent_tx"] == "0xaaa" and t["last_earned_tx"] == "0xeee"


def test_old_format_only_counts_settled_payments(tmp_path):
    """Ledgers written before this fix used signed/result pairs, and every
    signed payment counted. Now only the settled ones do."""
    old = [
        {"type": "signed", "id": "a", "at": "2026-10-24T10:00:00+00:00", "endpoint": "/x", "usd": "0.001"},
        {"type": "result", "id": "a", "settled": True, "tx": "0xold"},
        {"type": "signed", "id": "b", "at": "2026-10-24T10:01:00+00:00", "endpoint": "/x", "usd": "0.001"},
        {"type": "result", "id": "b", "settled": False, "error": "HTTP 402: {}"},
        {"type": "signed", "id": "c", "at": "2026-10-24T10:02:00+00:00", "endpoint": "/x", "usd": "0.001"},
    ]
    (tmp_path / "spent.jsonl").write_text("".join(json.dumps(e) + "\n" for e in old), encoding="utf-8")
    _, ledger, _ = make(tmp_path)
    assert ledger.spent_today_usd() == Decimal("0.001")
    assert ledger.totals()["last_spent_tx"] == "0xold"


def test_empty_ledger_totals_are_zero(tmp_path):
    t = Ledger(str(tmp_path / "nothing-yet")).totals()
    assert t["earned_usd"] == 0 and t["spent_usd"] == 0 and t["earned_count"] == 0


def test_half_written_line_is_skipped(tmp_path):
    _, ledger, guard = make(tmp_path)
    pay(guard)
    with open(tmp_path / "spent.jsonl", "a", encoding="utf-8") as f:
        f.write('{"type": "spent", "usd": ')
    assert ledger.spent_today_usd() == Decimal("0.001")
