"""Payment Planner: a Fetch.ai specialist agent that owns everything that
changes money or state -- due-soon notifications, approve/dismiss, pay,
impact. Stateless itself: every call goes straight to the Flask API in
server/. Writes (ExecuteActionRequest, PayRequest) are accepted only from
Pocket Pilot's own address, derived from POCKET_PILOT_SEED; anyone else
gets ok=False "unauthorized". Pocket Pilot only sends a write after getting
an explicit "yes" from the same chat sender who was offered that exact
action -- the pending-confirmation store lives in its dispatch.py. Reads
(due soon, impact) stay open to any agent.

Run standalone: python payment_planner_agent.py
"""
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from uagents import Agent, Context, Protocol  # noqa: E402
from uagents_core.identity import Identity  # noqa: E402

import api_client  # noqa: E402
from messages import (  # noqa: E402
    DueSoonRequest,
    DueSoonResponse,
    ExecuteActionRequest,
    ExecuteActionResponse,
    ImpactRequest,
    ImpactResponse,
    NotificationSummary,
    PayRequest,
    PayResponse,
)
from seeds import require_seed  # noqa: E402

PAYMENT_PLANNER_PORT = int(os.getenv("PAYMENT_PLANNER_PORT", "8003"))
POCKET_PILOT_ADDRESS = Identity.from_seed(require_seed("POCKET_PILOT_SEED"), 0).address
UNAUTHORIZED = "unauthorized"


def is_trusted_writer(sender):
    """Only Pocket Pilot may ask for a write; it holds the user's "yes"."""
    return sender == POCKET_PILOT_ADDRESS

agent = Agent(
    name="payment-planner",
    seed=require_seed("PAYMENT_PLANNER_SEED"),
    port=PAYMENT_PLANNER_PORT,
    mailbox=True,
    publish_agent_details=True,
)

planner_proto = Protocol(name="PocketPilotPaymentPlanner", version="1.0")


@planner_proto.on_message(DueSoonRequest, replies=DueSoonResponse)
async def handle_due_soon(ctx: Context, sender: str, msg: DueSoonRequest):
    ctx.logger.info(f"[{msg.request_id}] due-soon request from {sender}")
    try:
        notes = api_client.get_notifications()
    except api_client.ApiError as e:
        ctx.logger.warning(f"[{msg.request_id}] notifications failed: {e}")
        await ctx.send(sender, DueSoonResponse(request_id=msg.request_id, ok=False, error=str(e)))
        return
    summaries = [NotificationSummary(id=n["id"], kind=n["kind"], title=n["title"],
                                      body=n["body"], actions=n.get("actions", []))
                 for n in notes]
    ctx.logger.info(f"[{msg.request_id}] {len(summaries)} notification(s)")
    await ctx.send(sender, DueSoonResponse(request_id=msg.request_id, ok=True, notifications=summaries))


@planner_proto.on_message(ExecuteActionRequest, replies=ExecuteActionResponse)
async def handle_execute_action(ctx: Context, sender: str, msg: ExecuteActionRequest):
    ctx.logger.info(f"[{msg.request_id}] execute '{msg.action}' on {msg.note_id} "
                     f"for chat sender {msg.sender} (forwarded by {sender})")
    if not is_trusted_writer(sender):
        ctx.logger.warning(f"[{msg.request_id}] refused '{msg.action}' from untrusted {sender}")
        await ctx.send(sender, ExecuteActionResponse(request_id=msg.request_id, ok=False,
                                                     error=UNAUTHORIZED))
        return
    try:
        if msg.action == "approve":
            result = api_client.approve_notification(msg.note_id)
        elif msg.action == "dismiss":
            result = api_client.dismiss_notification(msg.note_id)
        else:
            raise api_client.ApiError(f"Unknown action {msg.action!r}")
    except api_client.ApiError as e:
        ctx.logger.warning(f"[{msg.request_id}] {msg.action} failed: {e}")
        await ctx.send(sender, ExecuteActionResponse(request_id=msg.request_id, ok=False, error=str(e),
                                                     not_found=e.not_found))
        return
    message = (result or {}).get("message", "Done.")
    ctx.logger.info(f"[{msg.request_id}] {msg.action} succeeded: {message}")
    await ctx.send(sender, ExecuteActionResponse(request_id=msg.request_id, ok=True, message=message))


@planner_proto.on_message(PayRequest, replies=PayResponse)
async def handle_pay(ctx: Context, sender: str, msg: PayRequest):
    ctx.logger.info(f"[{msg.request_id}] pay request from {sender}: "
                     f"{msg.merchant!r} ${msg.amount:.2f}")
    if not is_trusted_writer(sender):
        ctx.logger.warning(f"[{msg.request_id}] refused pay from untrusted {sender}")
        await ctx.send(sender, PayResponse(request_id=msg.request_id, ok=False, error=UNAUTHORIZED))
        return
    try:
        result = api_client.pay(merchant=msg.merchant, amount=msg.amount, card_id=msg.card)
    except api_client.ApiError as e:
        ctx.logger.warning(f"[{msg.request_id}] pay failed: {e}")
        await ctx.send(sender, PayResponse(request_id=msg.request_id, ok=False, error=str(e),
                                           not_found=e.not_found))
        return
    message = result.get("message") or f"Logged ${msg.amount:.2f} at {msg.merchant or 'that purchase'}."
    await ctx.send(sender, PayResponse(request_id=msg.request_id, ok=True, message=message))


@planner_proto.on_message(ImpactRequest, replies=ImpactResponse)
async def handle_impact(ctx: Context, sender: str, msg: ImpactRequest):
    ctx.logger.info(f"[{msg.request_id}] impact request from {sender}")
    try:
        result = api_client.impact()
    except api_client.ApiError as e:
        ctx.logger.warning(f"[{msg.request_id}] impact failed: {e}")
        await ctx.send(sender, ImpactResponse(request_id=msg.request_id, ok=False, error=str(e)))
        return
    message = result.get("message") or str(result)
    await ctx.send(sender, ImpactResponse(request_id=msg.request_id, ok=True, message=message))


agent.include(planner_proto, publish_manifest=True)


if __name__ == "__main__":
    print(f"Payment Planner agent address: {agent.address}")
    print(f"Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A{PAYMENT_PLANNER_PORT}"
          f"&address={agent.address}")
    agent.run()
