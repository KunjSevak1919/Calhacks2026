"""Pure chat dispatch logic for Pocket Pilot: no uagents import here, so this
module (and therefore the yes/no confirmation flow and intent routing) is
directly testable without a live agent runtime.

No money math happens here. Every number shown to the user comes from a
"delegate" -- an object with async score_pick/due_soon/execute_action/pay/
impact methods. The default (DirectDelegate) calls the Flask API directly,
same as before specialist agents existed. Pocket Pilot's real agent instead
passes a SpecialistDelegate (defined in pocket_pilot_agent.py, which is
allowed to import uagents) that tries the Card Scorer / Payment Planner
agents first and falls back to DirectDelegate's behavior on timeout -- but
dispatch.py doesn't need to know or care which path produced the answer.
"""
import logging
import time
import uuid

import api_client
import intents

PENDING_TTL_SECONDS = 600  # 10 minutes

logger = logging.getLogger("pocket_pilot.dispatch")

HELP_TEXT = (
    "I can: pick the best card for a purchase (\"use at Target for $42\"), "
    "turn Debt Guard on/off, tell you what's due soon, log a payment you already made, "
    "show how much you've saved, or answer credit questions. Just ask."
)


# ---------- delegate interface ----------

class DirectDelegate:
    """Calls the Flask API directly. The default delegate, and also what
    SpecialistDelegate falls back to when a specialist doesn't answer."""

    async def score_pick(self, request_id, merchant, amount, debt_guard=None):
        return api_client.pick(merchant=merchant, amount=amount, debt_guard=debt_guard)

    async def due_soon(self, request_id):
        return api_client.get_notifications()

    async def execute_action(self, request_id, sender, action, note_id):
        if action == "approve":
            return api_client.approve_notification(note_id)
        return api_client.dismiss_notification(note_id)

    async def pay(self, request_id, merchant, amount, card):
        return api_client.pay(merchant=merchant, amount=amount, card_id=card)

    async def impact(self, request_id):
        return api_client.impact()


# ---------- storage helpers (works with any .get(key)/.set(key, value) store,
# e.g. ctx.storage from uagents, or a plain dict-backed fake in tests) ----------

def _pending_key(sender):
    return f"pending:{sender}"


def _last_pick_key(sender):
    return f"last_pick:{sender}"


def get_pending(storage, sender):
    data = storage.get(_pending_key(sender))
    if not data:
        return None
    if data.get("expires_at", 0) < time.time():
        storage.set(_pending_key(sender), None)
        return None
    return data


def set_pending(storage, sender, action, note_id, summary):
    storage.set(_pending_key(sender), {
        "action": action, "note_id": note_id, "summary": summary,
        "expires_at": time.time() + PENDING_TTL_SECONDS,
    })


def clear_pending(storage, sender):
    storage.set(_pending_key(sender), None)


def get_last_pick(storage, sender):
    return storage.get(_last_pick_key(sender))


def set_last_pick(storage, sender, merchant, amount):
    storage.set(_last_pick_key(sender), {"merchant": merchant, "amount": amount})


# ---------- reply builders ----------

def format_pick(result, merchant, amount):
    best = result["best"]
    ranked = result["ranked"]
    reply = result.get("reason") or f"Use your {best['name']} ({best['rate_label']})."
    if len(ranked) > 1:
        reply += f" Runner-up: {ranked[1]['name']}."
    return reply


def _format_notification(note):
    return f"{note['title']}. {note['body']}"


async def handle_pick(storage, sender, parsed, delegate):
    merchant = parsed.get("merchant")
    amount = parsed.get("amount")
    if amount is None:
        return "How much is the purchase, and where?"
    request_id = str(uuid.uuid4())
    try:
        result = await delegate.score_pick(request_id, merchant, amount)
    except api_client.ApiError as e:
        return str(e)
    set_last_pick(storage, sender, merchant, amount)
    return format_pick(result, merchant, amount)


async def handle_debt_guard(storage, sender, enabled, delegate):
    try:
        api_client.set_debt_guard(enabled)
    except api_client.ApiError as e:
        return str(e)
    reply = f"Debt Guard is now {'on' if enabled else 'off'}."
    last_pick = get_last_pick(storage, sender)
    if last_pick and last_pick.get("amount") is not None:
        try:
            request_id = str(uuid.uuid4())
            result = await delegate.score_pick(request_id, last_pick.get("merchant"), last_pick["amount"])
            reply += " Same purchase, new pick: " + format_pick(result, last_pick.get("merchant"),
                                                                  last_pick["amount"])
        except api_client.ApiError:
            pass
    return reply


async def handle_notifications(storage, sender, delegate):
    request_id = str(uuid.uuid4())
    try:
        notes = await delegate.due_soon(request_id)
    except api_client.ApiError as e:
        return str(e)
    if not notes:
        return "Nothing due or waiting on you right now."
    top = notes[:3]
    lines = [_format_notification(n) for n in top]
    reply = " ".join(lines)
    first = notes[0]
    if first.get("actions"):
        set_pending(storage, sender, "approve", first["id"], first["title"])
        reply += " Want me to take care of it? (yes/no)"
    return reply


async def handle_confirm_yes(storage, sender, delegate):
    pending = get_pending(storage, sender)
    if not pending:
        return "I don't have anything waiting on a yes right now."
    request_id = str(uuid.uuid4())
    try:
        result = await delegate.execute_action(request_id, sender, "approve", pending["note_id"])
    except api_client.ApiError as e:
        return str(e)
    clear_pending(storage, sender)
    if result is None:
        return "That one's already handled."
    return result.get("message", "Done.")


async def handle_confirm_no(storage, sender, delegate):
    pending = get_pending(storage, sender)
    if not pending:
        return "Okay."
    request_id = str(uuid.uuid4())
    try:
        await delegate.execute_action(request_id, sender, "dismiss", pending["note_id"])
    except api_client.ApiError as e:
        return str(e)
    clear_pending(storage, sender)
    return "Okay, skipping that for now."


async def handle_pay(parsed, delegate):
    merchant, amount, card = parsed.get("merchant"), parsed.get("amount"), parsed.get("card")
    if amount is None:
        return "How much did you pay, and where?"
    request_id = str(uuid.uuid4())
    try:
        result = await delegate.pay(request_id, merchant, amount, card)
    except api_client.ApiError as e:
        return str(e)
    return result.get("message") or f"Logged ${amount:.2f} at {merchant or 'that purchase'}."


async def handle_impact(delegate):
    request_id = str(uuid.uuid4())
    try:
        result = await delegate.impact(request_id)
    except api_client.ApiError as e:
        return str(e)
    return result.get("message") or str(result)


def handle_coach(question):
    try:
        result = api_client.ask_coach(question)
    except api_client.ApiError as e:
        return str(e)
    return result.get("answer", "I'm not sure, try asking Coach directly in the app.")


def handle_reset_demo():
    try:
        api_client.demo_reset()
    except api_client.ApiError as e:
        return str(e)
    return "Demo reset."


async def build_reply(sender, text, storage, delegate=None):
    """Text + per-sender storage in, reply string out."""
    delegate = delegate or DirectDelegate()
    pending = get_pending(storage, sender)
    parsed = intents.parse_intent(text, has_pending=bool(pending))
    if parsed["intent"] == "unknown":
        llm_parsed = intents.parse_intent_llm(text)
        if llm_parsed:
            parsed = llm_parsed

    intent = parsed["intent"]
    if intent == "help":
        return HELP_TEXT
    if intent == "pick":
        return await handle_pick(storage, sender, parsed, delegate)
    if intent == "debt_guard_on":
        return await handle_debt_guard(storage, sender, True, delegate)
    if intent == "debt_guard_off":
        return await handle_debt_guard(storage, sender, False, delegate)
    if intent == "notifications":
        return await handle_notifications(storage, sender, delegate)
    if intent == "confirm_yes":
        return await handle_confirm_yes(storage, sender, delegate)
    if intent == "confirm_no":
        return await handle_confirm_no(storage, sender, delegate)
    if intent == "pay":
        return await handle_pay(parsed, delegate)
    if intent == "impact":
        return await handle_impact(delegate)
    if intent == "coach":
        return handle_coach(parsed.get("question") or text)
    if intent == "reset_demo":
        return handle_reset_demo()
    return "Not sure what you mean. Say \"help\" to see what I can do."
