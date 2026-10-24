"""Chat reply for "how much have the agents earned/spent?" (Coinbase x402).

Pure formatting over the ledger files (x402_ledger.py), which the x402
server and the Merchant Resolver write from their own processes. Amounts are
fractions of a cent, so they show 3 decimals ($0.001). Missing values show
as "—".
"""
import x402_config
from x402_ledger import Ledger, SpendGuard


def usd(value):
    if value is None:
        return "—"
    try:
        return f"${float(value):.3f}"
    except (TypeError, ValueError):
        return "—"


def _plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def format_stats(cfg, totals, remaining):
    lines = [f"Coinbase x402 on {cfg.network_name}, test USDC (not real money).",
             f"Earned: {usd(totals.get('earned_usd'))} from "
             f"{_plural(totals.get('earned_count') or 0, 'paid call')} by other agents.",
             f"Spent: {usd(totals.get('spent_usd'))} on "
             f"{_plural(totals.get('spent_count') or 0, 'merchant lookup')}.",
             f"Today's cap: {usd(remaining)} of {usd(cfg.daily_cap_usd)} left "
             f"(max {usd(cfg.max_per_call_usd)} per call)."]
    blocked = totals.get("blocked_count") or 0
    if blocked:
        lines.append(f"{_plural(blocked, 'payment')} blocked by the cap, so the free answer was used.")
    tx = totals.get("last_earned_tx") or totals.get("last_spent_tx")
    if tx:
        lines.append(f"Latest tx: {x402_config.tx_url(cfg.network, tx)}")
    return "\n".join(lines)


def stats_reply(cfg=None):
    cfg = cfg or x402_config.load()
    if not cfg.enabled:
        return (f"x402 payments are off ({cfg.reason}), so the agents haven't earned or "
                "spent anything. Everything else works as usual.")
    ledger = Ledger(cfg.ledger_dir)
    guard = SpendGuard(ledger, cfg.daily_cap_usd, cfg.max_per_call_usd)
    return format_stats(cfg, ledger.totals(), guard.remaining_today())
