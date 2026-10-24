"""Pocket Pilot Fetch.ai agent: Agent Chat Protocol + REST, backed by two
specialist agents (Card Scorer, Payment Planner) with a direct-Flask-API
fallback when a specialist doesn't answer within SPECIALIST_TIMEOUT_SECONDS.

Run: python pocket_pilot_agent.py  (with server/app.py already running)

The chat/intent logic lives in dispatch.py so it can be unit-tested without a
live uagents runtime. This file only wires that logic into the Agent Chat
Protocol, a couple of REST endpoints, and SpecialistDelegate (the thing that
actually talks to the other two agents over ctx.send_and_receive).
"""
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from uagents import Agent, Context, Model, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import (  # noqa: E402
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)
from uagents_core.identity import Identity  # noqa: E402

import api_client  # noqa: E402
import dispatch  # noqa: E402
import messages  # noqa: E402

SPECIALIST_TIMEOUT_SECONDS = 5

AGENT_PORT = int(os.getenv("POCKET_PILOT_PORT", os.getenv("AGENT_PORT", "8001")))
POCKET_PILOT_SEED = os.getenv("POCKET_PILOT_SEED", os.getenv("AGENT_SEED", "pocket-pilot-dev-seed"))
CARD_SCORER_SEED = os.getenv("CARD_SCORER_SEED", "card-scorer-dev-seed")
PAYMENT_PLANNER_SEED = os.getenv("PAYMENT_PLANNER_SEED", "payment-planner-dev-seed")

# An agent's address is derived from its seed the same way `Agent(seed=...)`
# does internally (Identity.from_seed(seed, 0)), so Pocket Pilot can know
# both specialists' addresses from their shared seeds -- no separate
# *_ADDRESS env vars to keep in sync.
CARD_SCORER_ADDRESS = Identity.from_seed(CARD_SCORER_SEED, 0).address
PAYMENT_PLANNER_ADDRESS = Identity.from_seed(PAYMENT_PLANNER_SEED, 0).address

agent = Agent(
    name="pocket-pilot",
    seed=POCKET_PILOT_SEED,
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)


def _card_dict(card):
    if card is None:
        return None
    return {"name": card.name, "net": card.net, "reward": card.reward,
            "interest": card.interest, "rate_label": card.rate_label}


class SpecialistDelegate(dispatch.DirectDelegate):
    """Tries the Card Scorer / Payment Planner agents first; falls back to
    calling the Flask API directly (inherited from DirectDelegate) if a
    specialist doesn't answer within SPECIALIST_TIMEOUT_SECONDS. Every
    method logs which path answered so the demo's log trail is legible."""

    def __init__(self, ctx: Context):
        self.ctx = ctx

    async def score_pick(self, request_id, merchant, amount, debt_guard=None):
        req = messages.ScoreRequest(request_id=request_id, merchant=merchant, amount=amount,
                                     debt_guard=debt_guard)
        try:
            resp, _status = await self.ctx.send_and_receive(
                CARD_SCORER_ADDRESS, req, response_type=messages.ScoreResponse,
                timeout=SPECIALIST_TIMEOUT_SECONDS)
        except Exception:
            resp = None
        if resp is not None and resp.ok:
            self.ctx.logger.info(f"[{request_id}] Card Scorer answered via agent message")
            ranked = [_card_dict(c) for c in resp.ranked]
            return {"best": _card_dict(resp.best), "ranked": ranked, "reason": resp.reason,
                    "store": {"category": resp.category, "mcc": resp.mcc, "confidence": resp.confidence}}
        self.ctx.logger.warning(f"[{request_id}] Card Scorer unreachable/timed out, "
                                 "falling back to direct API")
        return await super().score_pick(request_id, merchant, amount, debt_guard)

    async def due_soon(self, request_id):
        req = messages.DueSoonRequest(request_id=request_id)
        try:
            resp, _status = await self.ctx.send_and_receive(
                PAYMENT_PLANNER_ADDRESS, req, response_type=messages.DueSoonResponse,
                timeout=SPECIALIST_TIMEOUT_SECONDS)
        except Exception:
            resp = None
        if resp is not None and resp.ok:
            self.ctx.logger.info(f"[{request_id}] Payment Planner answered via agent message")
            return [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body,
                      "actions": n.actions} for n in resp.notifications]
        self.ctx.logger.warning(f"[{request_id}] Payment Planner unreachable/timed out, "
                                 "falling back to direct API")
        return await super().due_soon(request_id)

    async def execute_action(self, request_id, sender, action, note_id):
        req = messages.ExecuteActionRequest(request_id=request_id, sender=sender, action=action,
                                             note_id=note_id)
        try:
            resp, _status = await self.ctx.send_and_receive(
                PAYMENT_PLANNER_ADDRESS, req, response_type=messages.ExecuteActionResponse,
                timeout=SPECIALIST_TIMEOUT_SECONDS)
        except Exception:
            resp = None
        if resp is not None and resp.ok:
            self.ctx.logger.info(f"[{request_id}] Payment Planner executed '{action}' via agent message")
            return {"message": resp.message}
        self.ctx.logger.warning(f"[{request_id}] Payment Planner unreachable/timed out, "
                                 "falling back to direct API")
        return await super().execute_action(request_id, sender, action, note_id)

    async def pay(self, request_id, merchant, amount, card):
        req = messages.PayRequest(request_id=request_id, merchant=merchant, amount=amount, card=card)
        try:
            resp, _status = await self.ctx.send_and_receive(
                PAYMENT_PLANNER_ADDRESS, req, response_type=messages.PayResponse,
                timeout=SPECIALIST_TIMEOUT_SECONDS)
        except Exception:
            resp = None
        if resp is not None and resp.ok:
            self.ctx.logger.info(f"[{request_id}] Payment Planner logged payment via agent message")
            return {"message": resp.message}
        self.ctx.logger.warning(f"[{request_id}] Payment Planner unreachable/timed out, "
                                 "falling back to direct API")
        return await super().pay(request_id, merchant, amount, card)

    async def impact(self, request_id):
        req = messages.ImpactRequest(request_id=request_id)
        try:
            resp, _status = await self.ctx.send_and_receive(
                PAYMENT_PLANNER_ADDRESS, req, response_type=messages.ImpactResponse,
                timeout=SPECIALIST_TIMEOUT_SECONDS)
        except Exception:
            resp = None
        if resp is not None and resp.ok:
            self.ctx.logger.info(f"[{request_id}] Payment Planner answered impact via agent message")
            return {"message": resp.message}
        self.ctx.logger.warning(f"[{request_id}] Payment Planner unreachable/timed out, "
                                 "falling back to direct API")
        return await super().impact(request_id)


chat_proto = Protocol(spec=chat_protocol_spec)


def _text_chat(text):
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
    )


@chat_proto.on_message(ChatMessage)
async def handle_chat_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))

    text = "".join(item.text for item in msg.content if isinstance(item, TextContent))
    if not text.strip():
        return

    try:
        reply = await dispatch.build_reply(sender, text, ctx.storage, delegate=SpecialistDelegate(ctx))
    except Exception:
        ctx.logger.exception("build_reply failed")
        reply = "Something went wrong on my end. Try again in a moment."

    ctx.logger.info(f"[{sender}] {text!r} -> {reply!r}")
    await ctx.send(sender, _text_chat(reply))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_chat_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat_proto, publish_manifest=True)


class PickRequest(Model):
    merchant: Optional[str] = None
    amount: float
    debt_guard: Optional[bool] = None


class PickResponse(Model):
    ok: bool
    reply: Optional[str] = None
    error: Optional[str] = None


class HealthResponse(Model):
    ok: bool
    agent_address: str
    api_url: str
    card_scorer_address: str
    payment_planner_address: str


@agent.on_rest_get("/health", HealthResponse)
async def rest_health(ctx: Context) -> HealthResponse:
    api_ok = True
    try:
        api_client.health()
    except api_client.ApiError:
        api_ok = False
    return HealthResponse(ok=api_ok, agent_address=agent.address,
                           api_url=os.getenv("POCKET_PILOT_API_URL", api_client.DEFAULT_BASE_URL),
                           card_scorer_address=CARD_SCORER_ADDRESS,
                           payment_planner_address=PAYMENT_PLANNER_ADDRESS)


@agent.on_rest_post("/pick", PickRequest, PickResponse)
async def rest_pick(ctx: Context, req: PickRequest) -> PickResponse:
    try:
        result = await SpecialistDelegate(ctx).score_pick(str(uuid4()), req.merchant, req.amount,
                                                            req.debt_guard)
    except api_client.ApiError as e:
        return PickResponse(ok=False, error=str(e))
    return PickResponse(ok=True, reply=dispatch.format_pick(result, req.merchant, req.amount))


if __name__ == "__main__":
    print(f"Pocket Pilot agent address: {agent.address}")
    print(f"Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A{AGENT_PORT}"
          f"&address={agent.address}")
    print(f"Card Scorer address (from seed): {CARD_SCORER_ADDRESS}")
    print(f"Payment Planner address (from seed): {PAYMENT_PLANNER_ADDRESS}")
    agent.run()
