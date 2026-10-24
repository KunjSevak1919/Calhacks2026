"""Card Scorer: a Fetch.ai specialist agent that picks the best card for a
purchase. Stateless -- every call goes straight to the Flask API in
server/pocketpilot/scorer.py, which does the actual rewards-vs-interest math.

Called by the Pocket Pilot front-door agent over agent-to-agent messages,
but its protocol is published (publish_manifest=True) so any other agent on
Agentverse can resolve its address and call it directly too -- the hook for
a future Coinbase x402 paid endpoint (not built here).

Run standalone: python card_scorer_agent.py
"""
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from uagents import Agent, Context, Protocol  # noqa: E402

import api_client  # noqa: E402
from messages import CardSummary, ScoreRequest, ScoreResponse  # noqa: E402

CARD_SCORER_PORT = int(os.getenv("CARD_SCORER_PORT", "8002"))

agent = Agent(
    name="card-scorer",
    seed=os.getenv("CARD_SCORER_SEED", "card-scorer-dev-seed"),
    port=CARD_SCORER_PORT,
    mailbox=True,
    publish_agent_details=True,
)

score_proto = Protocol(name="PocketPilotCardScorer", version="1.0")


def _card_summary(card):
    return CardSummary(
        name=card.get("name", "?"),
        net=card.get("net"),
        reward=card.get("reward"),
        interest=card.get("interest"),
        rate_label=card.get("rate_label"),
    )


@score_proto.on_message(ScoreRequest, replies=ScoreResponse)
async def handle_score_request(ctx: Context, sender: str, msg: ScoreRequest):
    ctx.logger.info(f"[{msg.request_id}] score request from {sender}: "
                     f"{msg.merchant!r} ${msg.amount:.2f}")
    try:
        result = api_client.pick(merchant=msg.merchant, amount=msg.amount, mcc=msg.mcc,
                                  debt_guard=msg.debt_guard)
    except api_client.ApiError as e:
        ctx.logger.warning(f"[{msg.request_id}] pick failed: {e}")
        await ctx.send(sender, ScoreResponse(request_id=msg.request_id, ok=False, error=str(e)))
        return

    ranked = [_card_summary(c) for c in result["ranked"]]
    store = result.get("store", {})
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
    )
    ctx.logger.info(f"[{msg.request_id}] best={response.best.name if response.best else None!r}")
    await ctx.send(sender, response)


agent.include(score_proto, publish_manifest=True)


if __name__ == "__main__":
    print(f"Card Scorer agent address: {agent.address}")
    print(f"Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A{CARD_SCORER_PORT}"
          f"&address={agent.address}")
    agent.run()
