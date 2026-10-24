"""Card Scorer: a Fetch.ai specialist agent that picks the best card for a
purchase. Before scoring, it asks the Merchant Resolver specialist what
kind of store this is (Pocket Pilot -> Card Scorer -> Merchant Resolver ->
back), then calls the Flask API in server/pocketpilot/scorer.py, which does
the actual rewards-vs-interest math. The confidence-threshold decision
(trust the Resolver's mcc, or play safe with the merchant name only) lives
in card_scorer.py, which has no uagents import so it's directly testable.

Called by the Pocket Pilot front-door agent over agent-to-agent messages,
but its protocol is published (publish_manifest=True) so any other agent on
Agentverse can resolve its address and call it directly too. The same
answer is sold to other agents over Coinbase x402 by x402_server.py.

Run standalone: python card_scorer_agent.py
"""
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from uagents import Agent, Context, Protocol  # noqa: E402
from uagents_core.identity import Identity  # noqa: E402

import api_client  # noqa: E402
import card_scorer  # noqa: E402
import local_routing  # noqa: E402
import x402_config  # noqa: E402
from messages import CardSummary, ResolveRequest, ResolveResponse, ScoreRequest, ScoreResponse  # noqa: E402
from seeds import require_seed  # noqa: E402

CARD_SCORER_PORT = local_routing.port("card-scorer")
MERCHANT_RESOLVER_ADDRESS = Identity.from_seed(require_seed("MERCHANT_RESOLVER_SEED"), 0).address

# With x402 on, the Resolver may pay for a lookup first (sign, verify,
# settle on Base Sepolia: ~2-5s), so wait longer. Off: unchanged.
RESOLVER_TIMEOUT_SECONDS = 10 if x402_config.load().enabled else 4

agent = Agent(
    name="card-scorer",
    seed=require_seed("CARD_SCORER_SEED"),
    port=CARD_SCORER_PORT,
    # Mailbox keeps it registered on Agentverse; resolve= and the /health
    # route below make hops between our own agents local (local_routing.py).
    mailbox=True,
    publish_agent_details=True,
    resolve=local_routing.build_resolver(),
)
local_routing.keep_local_server(agent, "card-scorer")

score_proto = Protocol(name="PocketPilotCardScorer", version="1.0")


def _card_summary(card):
    return CardSummary(
        name=card.get("name", "?"),
        net=card.get("net"),
        reward=card.get("reward"),
        interest=card.get("interest"),
        rate_label=card.get("rate_label"),
        apr=card.get("apr"),
    )


async def _resolve_mcc(ctx: Context, request_id, merchant):
    """Ask the Merchant Resolver what kind of store this is, then let
    card_scorer.decide_mcc() decide whether to trust it."""
    if not merchant:
        return None, {}

    ctx.logger.info(f"asking resolver: {merchant!r}")
    req = ResolveRequest(request_id=request_id, merchant=merchant)
    try:
        resp, status = await ctx.send_and_receive(
            MERCHANT_RESOLVER_ADDRESS, req, response_type=ResolveResponse,
            timeout=RESOLVER_TIMEOUT_SECONDS)
        ctx.logger.info(f"[{request_id}] ResolveRequest -> Merchant Resolver via "
                         f"{local_routing.route(status)}")
    except Exception:
        resp = None

    mcc, store_info = card_scorer.decide_mcc(resp)
    if mcc:
        ctx.logger.info(f"[{request_id}] resolver confident ({store_info['confidence']:.2f}, "
                         f"{store_info['source']}) -> using mcc={mcc}")
    elif store_info:
        ctx.logger.info(f"[{request_id}] resolver unsure ({store_info['confidence']:.2f}) -- "
                         "sending merchant name only, server will play it safe")
    else:
        ctx.logger.warning(f"[{request_id}] resolver unreachable/timed out, "
                            f"letting the server resolve {merchant!r} itself")
    return mcc, store_info


@score_proto.on_message(ScoreRequest, replies=ScoreResponse)
async def handle_score_request(ctx: Context, sender: str, msg: ScoreRequest):
    ctx.logger.info(f"[{msg.request_id}] score request from {sender}: "
                     f"{msg.merchant!r} ${msg.amount:.2f}")

    if msg.mcc:
        resolved_mcc, store_info = msg.mcc, {}
    else:
        resolved_mcc, store_info = await _resolve_mcc(ctx, msg.request_id, msg.merchant)

    try:
        result = api_client.pick(merchant=msg.merchant, amount=msg.amount, mcc=resolved_mcc,
                                  debt_guard=msg.debt_guard)
    except api_client.ApiError as e:
        ctx.logger.warning(f"[{msg.request_id}] pick failed: {e}")
        await local_routing.reply(ctx, sender, ScoreResponse(request_id=msg.request_id, ok=False, error=str(e)))
        return

    ranked = [_card_summary(c) for c in result["ranked"]]
    # Prefer the Resolver's own answer (it keeps the override note); only
    # fall back to the server's store info when the Resolver wasn't asked
    # or didn't answer.
    store = store_info or (result.get("store") or {})
    response = ScoreResponse(
        request_id=msg.request_id,
        ok=True,
        best=ranked[0] if ranked else None,
        runner_up=ranked[1] if len(ranked) > 1 else None,
        ranked=ranked,
        reason=result.get("reason"),
        category=store.get("category"),
        mcc=store.get("mcc"),
        confidence=store.get("confidence"),
        source=store.get("source"),
        note=store.get("note"),
    )
    ctx.logger.info(f"[{msg.request_id}] best={response.best.name if response.best else None!r}")
    await local_routing.reply(ctx, sender, response)


agent.include(score_proto, publish_manifest=True)


if __name__ == "__main__":
    print(f"Card Scorer agent address: {agent.address}")
    print(local_routing.describe())
    print(f"Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A{CARD_SCORER_PORT}"
          f"&address={agent.address}")
    print(f"Merchant Resolver address (from seed): {MERCHANT_RESOLVER_ADDRESS}")
    agent.run()
