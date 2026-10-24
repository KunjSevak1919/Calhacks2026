"""Merchant Resolver: a Fetch.ai specialist agent that turns a store name
into a merchant category code (MCC), category, and confidence for card
rewards. The first hop in Card Scorer's chain:
  Pocket Pilot -> Card Scorer -> Merchant Resolver -> back to Card Scorer

No LLM: it's a thin uagents wrapper around the deterministic resolver in
server/pocketpilot/resolver.py (see merchant_resolver.py, which holds the
read-only import and all the actual logic, so it's unit-testable without a
live agent).

Its protocol is published (publish_manifest=True) so any other agent on
Agentverse can resolve its address and call it directly too -- a hook for
a future Coinbase x402 paid lookup on low-confidence guesses
(needs_paid_lookup=True in ResolveResponse), not built here.

Run standalone: python merchant_resolver_agent.py
"""
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from uagents import Agent, Context, Protocol  # noqa: E402

import merchant_resolver  # noqa: E402
from messages import ResolveRequest, ResolveResponse  # noqa: E402
from seeds import require_seed  # noqa: E402

MERCHANT_RESOLVER_PORT = int(os.getenv("MERCHANT_RESOLVER_PORT", "8004"))

agent = Agent(
    name="merchant-resolver",
    seed=require_seed("MERCHANT_RESOLVER_SEED"),
    port=MERCHANT_RESOLVER_PORT,
    mailbox=True,
    publish_agent_details=True,
)

resolver_proto = Protocol(name="PocketPilotMerchantResolver", version="1.0")


@resolver_proto.on_message(ResolveRequest, replies=ResolveResponse)
async def handle_resolve(ctx: Context, sender: str, msg: ResolveRequest):
    ctx.logger.info(f"[{msg.request_id}] resolve request from {sender}: {msg.merchant!r}")
    try:
        result, needs_paid_lookup = merchant_resolver.resolve_store(
            merchant=msg.merchant, mcc=msg.mcc, place_types=msg.place_types, domain=msg.domain)
    except Exception as e:
        ctx.logger.exception(f"[{msg.request_id}] resolve failed")
        await ctx.send(sender, ResolveResponse(request_id=msg.request_id, ok=False, error=str(e)))
        return

    flag = " [needs_paid_lookup]" if needs_paid_lookup else ""
    ctx.logger.info(f"{msg.merchant} -> {result['category']} {result['mcc']} "
                     f"({result['confidence']:.2f}, {result['source']}){flag}")
    await ctx.send(sender, ResolveResponse(
        request_id=msg.request_id, ok=True, merchant=result["merchant"], category=result["category"],
        label=result["label"], mcc=result["mcc"], confidence=result["confidence"],
        source=result["source"], note=result.get("note"), needs_paid_lookup=needs_paid_lookup))


agent.include(resolver_proto, publish_manifest=True)


if __name__ == "__main__":
    print(f"Merchant Resolver agent address: {agent.address}")
    print(f"Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A{MERCHANT_RESOLVER_PORT}"
          f"&address={agent.address}")
    agent.run()
