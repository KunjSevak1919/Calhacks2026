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


def test_reserve_under_cap_is_allowed_and_counted(tmp_path):
    _, ledger, guard = make(tmp_path)
    pid, reason = guard.reserve("/x402/merchant-data", Decimal("0.001"))
    assert pid and reason is None
    assert ledger.signed_today_usd() == Decimal("0.001")
    assert guard.remaining_today() == Decimal("0.002")


def test_daily_cap_blocks_payment_and_logs_why(tmp_path):
    _, ledger, guard = make(tmp_path)
    for _ in range(3):
        assert guard.reserve("/x402/merchant-data", "0.001")[0]
    pid, reason = guard.reserve("/x402/merchant-data", "0.001")
    assert pid is None
    assert "over daily cap" in reason
    assert ledger.totals()["blocked_count"] == 1
    assert ledger.signed_today_usd() == Decimal("0.003")  # the blocked one isn't counted


def test_per_call_max_blocks_payment(tmp_path):
    _, _, guard = make(tmp_path)
    pid, reason = guard.reserve("/x402/merchant-data", "0.005")
    assert pid is None
    assert "per-call max" in reason


def test_cap_resets_next_utc_day(tmp_path):
    clock, _, guard = make(tmp_path)
    for _ in range(3):
        guard.reserve("/x", "0.001")
    assert guard.reserve("/x", "0.001")[0] is None
    clock.now += timedelta(days=1)
    assert guard.reserve("/x", "0.001")[0] is not None


def test_totals_count_only_settled_spending(tmp_path):
    _, ledger, guard = make(tmp_path)
    a, _ = guard.reserve("/x402/merchant-data", "0.001")
    b, _ = guard.reserve("/x402/merchant-data", "0.001")
    ledger.record_result(a, settled=True, tx="0xaaa")
    ledger.record_result(b, settled=False, error="server said 502")
    ledger.record_earned("/x402/best-card", Decimal("0.001"), tx="0xeee", payer="0xp")
    t = ledger.totals()
    assert t["spent_usd"] == Decimal("0.001") and t["spent_count"] == 1
    assert t["signed_today_usd"] == Decimal("0.002")  # both still count against the cap
    assert t["earned_usd"] == Decimal("0.001") and t["earned_count"] == 1
    assert t["last_spent_tx"] == "0xaaa" and t["last_earned_tx"] == "0xeee"


def test_empty_ledger_totals_are_zero(tmp_path):
    t = Ledger(str(tmp_path / "nothing-yet")).totals()
    assert t["earned_usd"] == 0 and t["spent_usd"] == 0 and t["earned_count"] == 0


def test_half_written_line_is_skipped(tmp_path):
    _, ledger, guard = make(tmp_path)
    guard.reserve("/x", "0.001")
    with open(tmp_path / "spent.jsonl", "a", encoding="utf-8") as f:
        f.write('{"type": "signed", "usd": ')
    assert ledger.signed_today_usd() == Decimal("0.001")
