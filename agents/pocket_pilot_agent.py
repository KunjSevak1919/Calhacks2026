"""Pocket Pilot Fetch.ai agent: Agent Chat Protocol + REST, backed by the Flask API.

Run: python pocket_pilot_agent.py  (with server/app.py already running)

The chat/intent logic lives in dispatch.py so it can be unit-tested without a
live uagents runtime. This file only wires that logic into the Agent Chat
Protocol and a couple of REST endpoints.
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

import api_client  # noqa: E402
import dispatch  # noqa: E402

AGENT_PORT = int(os.getenv("AGENT_PORT", "8001"))

agent = Agent(
    name="pocket-pilot",
    seed=os.getenv("AGENT_SEED", "pocket-pilot-dev-seed"),
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)

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
        reply = dispatch.build_reply(sender, text, ctx.storage)
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


@agent.on_rest_get("/health", HealthResponse)
async def rest_health(ctx: Context) -> HealthResponse:
    api_ok = True
    try:
        api_client.health()
    except api_client.ApiError:
        api_ok = False
    return HealthResponse(ok=api_ok, agent_address=agent.address,
                           api_url=os.getenv("POCKET_PILOT_API_URL", api_client.DEFAULT_BASE_URL))


@agent.on_rest_post("/pick", PickRequest, PickResponse)
async def rest_pick(ctx: Context, req: PickRequest) -> PickResponse:
    try:
        result = api_client.pick(merchant=req.merchant, amount=req.amount, debt_guard=req.debt_guard)
    except api_client.ApiError as e:
        return PickResponse(ok=False, error=str(e))
    return PickResponse(ok=True, reply=dispatch.format_pick(result, req.merchant, req.amount))


if __name__ == "__main__":
    print(f"Pocket Pilot agent address: {agent.address}")
    print(f"Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A{AGENT_PORT}"
          f"&address={agent.address}")
    agent.run()
