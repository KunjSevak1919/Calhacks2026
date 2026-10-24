"""How long our agents wait for each other, in seconds.

Longer when Coinbase x402 is on, because Merchant Resolver may pay for a
merchant lookup first (sign, verify, settle on Base Sepolia). If a wait runs
out, the caller falls back to the Flask API as always, and a paid answer
that arrives late is still cached for the next question about that store.
"""
RESOLVER_WAIT = 4          # Card Scorer -> Merchant Resolver
RESOLVER_WAIT_X402 = 7
SCORER_WAIT = 10           # Pocket Pilot -> Card Scorer
SCORER_WAIT_X402 = 15


def resolver_wait_seconds(x402_on):
    return RESOLVER_WAIT_X402 if x402_on else RESOLVER_WAIT


def scorer_wait_seconds(x402_on):
    return SCORER_WAIT_X402 if x402_on else SCORER_WAIT
