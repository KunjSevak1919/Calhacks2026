"""Merchant Resolver: a Fetch.ai specialist agent that turns a store name
into a merchant category code (MCC), category, and confidence for card
rewards. The first hop in Card Scorer's chain:
  Pocket Pilot -> Card Scorer -> Merchant Resolver -> back to Card Scorer

No LLM: it's a thin uagents wrapper around the deterministic resolver in
server/pocketpilot/resolver.py (see merchant_resolver.py, which holds the
read-only import and all the actual logic, so it's unit-testable without a
live agent).

Its protocol is published (publish_manifest=True) so any other agent on
Agentverse can resolve its address and call it directly too.

Coinbase x402: when it's unsure (confidence < 0.6) and x402 is on, it pays
our /x402/merchant-data endpoint for a better category (paid_lookup.py),
within the hard spending caps. Any failure keeps the free answer.

Run standalone: python merchant_resolver_agent.py
"""
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from uagents import Agent, Context, Protocol  # noqa: E402

import local_routing  # noqa: E402
import merchant_resolver  # noqa: E402
import paid_lookup  # noqa: E402
import x402_config  # noqa: E402
from messages import ResolveRequest, ResolveResponse  # noqa: E402
from seeds import require_seed  # noqa: E402

MERCHANT_RESOLVER_PORT = local_routing.port("merchant-resolver")

X402 = x402_config.load()
if X402.enabled and not X402.is_testnet:
    sys.exit(f"Merchant Resolver: X402_NETWORK={X402.network!r} is not a test network. Refusing to start.")
PAID_LOOKUP = paid_lookup.build(X402)

agent = Agent(
    name="merchant-resolver",
    seed=require_seed("MERCHANT_RESOLVER_SEED"),
    port=MERCHANT_RESOLVER_PORT,
    # Mailbox keeps it registered on Agentverse; resolve= and the /health
    # route below make hops between our own agents local (local_routing.py).
    mailbox=True,
    publish_agent_details=True,
    resolve=local_routing.build_resolver(),
)
local_routing.keep_local_server(agent, "merchant-resolver")


@agent.on_event("startup")
async def warm_up_payer(ctx: Context):
    ctx.logger.info(x402_config.status_line(X402))
    if PAID_LOOKUP:
        # Fetch the CDP wallet now, so the first paid lookup isn't slowed by it.
        await asyncio.to_thread(PAID_LOOKUP.warm_up)

resolver_proto = Protocol(name="PocketPilotMerchantResolver", version="1.0")


@resolver_proto.on_message(ResolveRequest, replies=ResolveResponse)
async def handle_resolve(ctx: Context, sender: str, msg: ResolveRequest):
    ctx.logger.info(f"[{msg.request_id}] resolve request from {sender}: {msg.merchant!r}")
    try:
        result, needs_paid_lookup = merchant_resolver.resolve_store(
            merchant=msg.merchant, mcc=msg.mcc, place_types=msg.place_types, domain=msg.domain)
    except Exception as e:
        ctx.logger.exception(f"[{msg.request_id}] resolve failed")
        await local_routing.reply(ctx, sender, ResolveResponse(request_id=msg.request_id, ok=False, error=str(e)))
        return

    if needs_paid_lookup and PAID_LOOKUP and msg.merchant and not msg.mcc:
        ctx.logger.info(f"[{msg.request_id}] unsure about {msg.merchant!r} "
                         f"({result['confidence']:.2f}); trying a paid x402 lookup")
        result, why = await asyncio.to_thread(PAID_LOOKUP.improve, msg.merchant, result)
        ctx.logger.info(f"[{msg.request_id}] x402: {why}")
        needs_paid_lookup = result["confidence"] < merchant_resolver.LOW_CONFIDENCE

    flag = " [needs_paid_lookup]" if needs_paid_lookup else ""
    ctx.logger.info(f"{msg.merchant} -> {result['category']} {result['mcc']} "
                     f"({result['confidence']:.2f}, {result['source']}){flag}")
    await local_routing.reply(ctx, sender, ResolveResponse(
        request_id=msg.request_id, ok=True, merchant=result["merchant"], category=result["category"],
        label=result["label"], mcc=result["mcc"], confidence=result["confidence"],
        source=result["source"], note=result.get("note"), needs_paid_lookup=needs_paid_lookup))


agent.include(resolver_proto, publish_manifest=True)


if __name__ == "__main__":
    print(f"Merchant Resolver agent address: {agent.address}")
    print(local_routing.describe())
    print(f"Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A{MERCHANT_RESOLVER_PORT}"
          f"&address={agent.address}")
    agent.run()
