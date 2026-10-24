"""Every agent's seed must come from .env. There are no defaults: a seed is
the agent's identity (its address is derived from it), so a guessable
built-in one would let anyone impersonate Pocket Pilot."""
import os

ALL_SEEDS = ("POCKET_PILOT_SEED", "CARD_SCORER_SEED", "PAYMENT_PLANNER_SEED",
             "MERCHANT_RESOLVER_SEED")


def missing_seeds(names=ALL_SEEDS):
    return [n for n in names if not os.getenv(n, "").strip()]


def require_seed(name):
    """The seed's value, or stop the agent with a clear message."""
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is missing. Add {name}=<a long random string> to .env "
                         "(see .env.example), then start the agent again.")
    return value
