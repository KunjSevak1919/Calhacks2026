"""Coinbase x402 settings, read from the repo's .env. Test network only.

x402 is on only when all three CDP keys are set, X402_ENABLED isn't "off",
and the x402 + cdp-sdk packages import. Otherwise every agent works exactly
as before and logs one line saying why x402 is off. Key VALUES are never
printed or logged -- only the names of missing keys.

No uagents import here, so it's directly testable.
"""
import os
from dataclasses import dataclass
from decimal import Decimal

CDP_KEY_NAMES = ("CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET")

# The only networks x402 may run on. Each entry: display name, the test USDC
# contract (x402's own default asset for that network), its decimals, and a
# block explorer for tx links. Anything not listed here refuses to start.
TESTNETS = {
    "eip155:84532": {
        "name": "Base Sepolia",
        "usdc": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "decimals": 6,
        "explorer_tx": "https://sepolia.basescan.org/tx/",
        "faucet_network": "base-sepolia",
        "rpc": "https://sepolia.base.org",
    },
}

DEFAULT_NETWORK = "eip155:84532"
DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator"
# How long a signed payment stays usable (EIP-3009 validBefore). Short, so a
# payment that failed to settle can't be settled long after the fact.
AUTHORIZATION_WINDOW_SECONDS = 120
DEFAULT_LEDGER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".x402")

# CDP Server Wallet account names (created on first use by x402_setup.py).
SELLER_ACCOUNT = "pocket-pilot-seller"   # receives x402 earnings
BUYER_ACCOUNT = "pocket-pilot-buyer"     # Merchant Resolver pays from this one
DEMO_ACCOUNT = "shopping-agent-demo"     # the demo client ("another agent")


class X402ConfigError(Exception):
    """Raised for a config x402 must refuse to run with (e.g. a mainnet)."""


@dataclass(frozen=True)
class X402Config:
    enabled: bool
    reason: str               # why it's off (empty when on)
    network: str
    facilitator_url: str
    host: str
    port: int
    server_url: str           # where our paid endpoints live
    price_best_card_usd: Decimal
    price_merchant_data_usd: Decimal
    daily_cap_usd: Decimal
    max_per_call_usd: Decimal
    ledger_dir: str
    pay_to: str               # optional override; else the seller CDP account
    facilitator_timeout_seconds: float  # per verify/settle call
    client_timeout_seconds: float       # a paying client waits this long for the answer
    rpc_url: str              # for on-chain checks of a payment's authorization

    @property
    def network_name(self):
        return TESTNETS.get(self.network, {}).get("name", self.network)

    @property
    def usdc(self):
        return TESTNETS.get(self.network, {}).get("usdc")

    @property
    def is_testnet(self):
        return self.network in TESTNETS


def _missing_keys(env):
    return [k for k in CDP_KEY_NAMES if not (env.get(k) or "").strip()]


def _packages_missing():
    try:
        import cdp  # noqa: F401
        import x402  # noqa: F401
    except ImportError as e:
        return str(e.name or e)
    return None


def _usd(env, name, default):
    raw = (env.get(name) or "").strip() or default
    try:
        value = Decimal(raw)
    except ArithmeticError as e:
        raise X402ConfigError(f"{name} must be a dollar amount like {default}, got {raw!r}") from e
    if value < 0:
        raise X402ConfigError(f"{name} can't be negative")
    return value


def _seconds(env, name, default):
    raw = (env.get(name) or "").strip() or default
    try:
        value = float(raw)
    except ValueError as e:
        raise X402ConfigError(f"{name} must be a number of seconds, got {raw!r}") from e
    if value <= 0:
        raise X402ConfigError(f"{name} must be more than 0")
    return value


def load(env=None):
    """Build the config from env (default os.environ). Never raises for a
    missing key -- that just turns x402 off. Raises X402ConfigError only for
    values that are present but wrong (bad dollar amounts)."""
    env = os.environ if env is None else env
    port = int(env.get("X402_PORT") or 8010)
    host = (env.get("X402_HOST") or "127.0.0.1").strip()

    reason = ""
    if (env.get("X402_ENABLED") or "on").strip().lower() in ("off", "0", "false", "no"):
        reason = "X402_ENABLED=off"
    elif _missing_keys(env):
        reason = f"missing {', '.join(_missing_keys(env))} in .env"
    elif _packages_missing():
        reason = f"package not installed ({_packages_missing()}); pip install -r requirements.txt"

    network = (env.get("X402_NETWORK") or DEFAULT_NETWORK).strip()
    return X402Config(
        enabled=not reason,
        reason=reason,
        network=network,
        facilitator_url=(env.get("X402_FACILITATOR_URL") or DEFAULT_FACILITATOR_URL).strip().rstrip("/"),
        host=host,
        port=port,
        server_url=(env.get("X402_SERVER_URL") or f"http://127.0.0.1:{port}").strip().rstrip("/"),
        price_best_card_usd=_usd(env, "X402_PRICE_BEST_CARD_USD", "0.001"),
        price_merchant_data_usd=_usd(env, "X402_PRICE_MERCHANT_DATA_USD", "0.001"),
        daily_cap_usd=_usd(env, "X402_DAILY_CAP_USD", "0.05"),
        max_per_call_usd=_usd(env, "X402_MAX_PER_CALL_USD", "0.01"),
        ledger_dir=(env.get("X402_LEDGER_DIR") or DEFAULT_LEDGER_DIR).strip(),
        pay_to=(env.get("X402_PAY_TO") or "").strip(),
        facilitator_timeout_seconds=_seconds(env, "X402_FACILITATOR_TIMEOUT_SECONDS", "30"),
        client_timeout_seconds=_seconds(env, "X402_CLIENT_TIMEOUT_SECONDS", "150"),
        rpc_url=(env.get("X402_RPC_URL") or TESTNETS.get(network, {}).get("rpc") or "").strip(),
    )


def require_testnet(cfg):
    """Refuse to run x402 on anything but a known test network."""
    if not cfg.is_testnet:
        raise X402ConfigError(
            f"X402_NETWORK={cfg.network!r} is not a test network. Pocket Pilot only runs x402 "
            f"on {', '.join(f'{k} ({v['name']})' for k, v in TESTNETS.items())}. Refusing to start.")


def status_line(cfg):
    if not cfg.enabled:
        return f"x402: off ({cfg.reason}). Everything else works as before."
    return (f"x402: on ({cfg.network_name} {cfg.network}, test USDC only; "
            f"daily cap ${cfg.daily_cap_usd}, max ${cfg.max_per_call_usd} per call; "
            f"paid endpoints at {cfg.server_url})")


def usd_to_atomic(usd, network):
    return int(Decimal(usd) * (10 ** TESTNETS[network]["decimals"]))


def atomic_to_usd(atomic, network):
    return Decimal(int(atomic)) / (10 ** TESTNETS[network]["decimals"])


def tx_url(network, tx):
    base = TESTNETS.get(network, {}).get("explorer_tx")
    return f"{base}{tx}" if base and tx else None
