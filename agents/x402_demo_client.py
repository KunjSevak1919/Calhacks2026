"""Demo: "another AI shopping agent" buys an answer from Pocket Pilot over x402.

  1. asks POST /x402/best-card without paying      -> HTTP 402 + price
  2. checks the price against its own caps, signs a test-USDC payment
     from its CDP wallet (shopping-agent-demo), and retries
  3. gets the best card + the facilitator's receipt (tx on Base Sepolia)

Test network only. Its spending is logged separately from Pocket Pilot's
(.x402/demo-client/), under the same caps from .env.

Run (with server/app.py and x402_server.py running):
  python x402_demo_client.py
  python x402_demo_client.py --merchant Costco --amount 42 --debt-guard
"""
import argparse
import base64
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import requests  # noqa: E402

import x402_config  # noqa: E402


def say(step, text):
    print(f"\n[{step}] {text}")


def show_402(resp, network):
    required = json.loads(base64.b64decode(resp.headers["PAYMENT-REQUIRED"]))
    accept = required["accepts"][0]
    net = x402_config.TESTNETS.get(accept["network"], {"name": accept["network"]})
    print(f"    HTTP {resp.status_code} Payment Required")
    print(f"    price:   ${x402_config.atomic_to_usd(accept['amount'], network)} "
          f"({accept['amount']} atomic units, {accept.get('extra', {}).get('name', 'token')})")
    print(f"    network: {net['name']} ({accept['network']})")
    print(f"    asset:   {accept['asset']}")
    print(f"    pay to:  {accept['payTo']}")
    print(f"    scheme:  {accept['scheme']} (signed USDC transfer authorization, settled by the facilitator)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--merchant", default="Whole Foods")
    parser.add_argument("--amount", type=float, default=84.5)
    parser.add_argument("--debt-guard", action="store_true", help="ask as a user carrying a balance")
    args = parser.parse_args()

    cfg = x402_config.load()
    print(x402_config.status_line(cfg))
    if not cfg.enabled:
        sys.exit(1)
    try:
        x402_config.require_testnet(cfg)
    except x402_config.X402ConfigError as e:
        sys.exit(str(e))

    url = f"{cfg.server_url}/x402/best-card"
    body = {"merchant": args.merchant, "amount": args.amount}
    if args.debt_guard:
        body["debt_guard"] = True

    say(1, f"Shopping agent: \"Which card for ${args.amount:.2f} at {args.merchant}?\" "
           f"-> POST {url} (no payment)")
    try:
        first = requests.post(url, json=body, timeout=10)
    except requests.RequestException as e:
        sys.exit(f"    Can't reach {url} ({type(e).__name__}). Is x402_server.py running?")
    if first.status_code != 402:
        sys.exit(f"    Expected 402, got {first.status_code}: {first.text[:200]}")
    show_402(first, cfg.network)

    import x402_wallet
    from x402_ledger import Ledger, SpendGuard
    from x402_payer import X402Payer

    say(2, f"Loading this agent's CDP wallet ({x402_config.DEMO_ACCOUNT}) and paying, "
           f"within its caps (${cfg.max_per_call_usd}/call, ${cfg.daily_cap_usd}/day)")
    ledger = Ledger(os.path.join(cfg.ledger_dir, "demo-client"))
    payer = X402Payer(cfg, x402_wallet.signer_for(x402_config.DEMO_ACCOUNT),
                      SpendGuard(ledger, cfg.daily_cap_usd, cfg.max_per_call_usd), timeout=30)
    print(f"    wallet: {payer.address}")
    result = payer.post(url, body)
    for s in result.steps:
        print(f"    - {s}")

    if not result.ok:
        say(3, f"No answer: {result.reason}")
        sys.exit(1)

    a = result.data
    say(3, "Paid answer from Pocket Pilot:")
    print(f"    best card: {a.get('best_card') or '—'} ({a.get('rate_label') or '—'})")
    print(f"    reason:    {a.get('reason') or '—'}")
    print(f"    store:     {a.get('merchant')} -> {a.get('category') or '—'}, MCC {a.get('mcc') or '—'}")
    print(f"    runner-up: {a.get('runner_up') or '—'}")
    print(f"    receipt:   ${result.usd} test USDC, tx {result.tx}")
    if result.tx_url:
        print(f"               {result.tx_url}")


if __name__ == "__main__":
    main()
