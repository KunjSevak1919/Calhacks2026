from decimal import Decimal

import pytest

import dispatch
import intents
import x402_report
from tests.fake_storage import FakeStorage
from tests.x402_fakes import config
from x402_ledger import Ledger, SpendGuard


def run(coro):
    import asyncio
    return asyncio.run(coro)


@pytest.mark.parametrize("text", [
    "how much have the agents earned?", "How much have the agents spent?",
    "how much have the agents earned/spent?", "x402 stats", "@agent1qxyz what have the agents earned",
])
def test_x402_questions_parse(text):
    assert intents.parse_intent(text)["intent"] == "x402_stats"


@pytest.mark.parametrize("text", ["How much have you saved me?", "Which card at Costco for $42?"])
def test_other_questions_are_not_x402(text):
    assert intents.parse_intent(text)["intent"] != "x402_stats"


def test_reply_reports_earned_spent_and_remaining_cap(tmp_path):
    cfg = config(tmp_path)
    ledger = Ledger(cfg.ledger_dir)
    guard = SpendGuard(ledger, cfg.daily_cap_usd, cfg.max_per_call_usd)
    ledger.record_earned("/x402/best-card", Decimal("0.001"), tx="0xe1")
    ledger.record_earned("/x402/best-card", Decimal("0.001"), tx="0xe2")
    hold, _ = guard.reserve("/x402/merchant-data", Decimal("0.001"))
    guard.confirm(hold, tx="0xs1")
    reply = x402_report.stats_reply(cfg)
    assert "test USDC (not real money)" in reply
    assert "Earned: $0.002 from 2 paid calls" in reply
    assert "Spent: $0.001 on 1 merchant lookup." in reply
    assert "Today's cap: $0.049 of $0.050 left (max $0.010 per call)" in reply
    assert "https://sepolia.basescan.org/tx/0xe2" in reply


def test_reply_mentions_blocked_payments(tmp_path):
    cfg = config(tmp_path, x402_daily_cap_usd="0")
    SpendGuard(Ledger(cfg.ledger_dir), cfg.daily_cap_usd, cfg.max_per_call_usd).reserve("/x", "0.001")
    reply = x402_report.stats_reply(cfg)
    assert "1 payment blocked by the cap" in reply
    assert "Today's cap: $0.000 of $0.000 left" in reply


def test_reply_when_x402_is_off_says_so_without_key_values(tmp_path):
    cfg = config(tmp_path, cdp_wallet_secret="")
    reply = x402_report.stats_reply(cfg)
    assert reply.startswith("x402 payments are off (missing CDP_WALLET_SECRET")
    assert "secret" not in reply.replace("SECRET", "")  # no key values


def test_chat_routes_to_x402_reply():
    # conftest sets X402_ENABLED=off, so this is the "off" reply.
    reply = run(dispatch.build_reply("alice", "How much have the agents earned?", FakeStorage()))
    assert "x402 payments are off" in reply


def test_usd_never_crashes():
    assert x402_report.usd(None) == "—"
    assert x402_report.usd("nope") == "—"
    assert x402_report.usd(Decimal("0.0015")) == "$0.002"
