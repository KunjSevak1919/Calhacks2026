"""One-time x402 setup: creates (or finds) the three CDP Server Wallet
accounts, prints their ADDRESSES (never keys), and asks CDP's testnet faucet
for test USDC for the two that pay. Base Sepolia only.

  pocket-pilot-seller  receives x402 earnings (/x402/best-card, /x402/merchant-data)
  pocket-pilot-buyer   Merchant Resolver pays from this one (capped)
  shopping-agent-demo  x402_demo_client.py, playing "another AI agent"

Run: python x402_setup.py            (accounts + faucet)
     python x402_setup.py --no-faucet (just print addresses and balances)
The faucet is rate-limited; if it refuses, wait and run again.
"""
import argparse
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import x402_config  # noqa: E402

ACCOUNTS = [x402_config.SELLER_ACCOUNT, x402_config.BUYER_ACCOUNT, x402_config.DEMO_ACCOUNT]
PAYING = {x402_config.BUYER_ACCOUNT, x402_config.DEMO_ACCOUNT}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-faucet", action="store_true", help="don't request test USDC")
    args = parser.parse_args()

    cfg = x402_config.load()
    print(x402_config.status_line(cfg))
    if not cfg.enabled:
        sys.exit(1)
    try:
        x402_config.require_testnet(cfg)
    except x402_config.X402ConfigError as e:
        sys.exit(str(e))

    import x402_wallet

    net = x402_config.TESTNETS[cfg.network]
    accounts = x402_wallet.get_accounts(ACCOUNTS)
    for name in ACCOUNTS:
        address = accounts[name].address
        print(f"\n{name}: {address}")
        if name in PAYING and not args.no_faucet:
            try:
                tx = x402_wallet.request_test_usdc(address, net["faucet_network"])
                print(f"  faucet: requested test USDC, tx {x402_config.tx_url(cfg.network, tx)}")
            except Exception as e:
                print(f"  faucet: refused ({type(e).__name__}: {e}). Wait a bit and run again, or use "
                      "https://portal.cdp.coinbase.com/products/faucet")
        try:
            print(f"  balance: ${x402_wallet.usdc_balance(address, cfg.network)} test USDC "
                  f"on {net['name']} (faucet funds can take a minute to show)")
        except Exception as e:
            print(f"  balance: couldn't read ({type(e).__name__})")


if __name__ == "__main__":
    main()
