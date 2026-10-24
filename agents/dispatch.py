"""Pure chat dispatch logic for Pocket Pilot: no uagents import here, so this
module (and therefore the yes/no confirmation flow and intent routing) is
directly testable without a live agent runtime.

No money math happens here. Every number shown to the user comes straight
from api_client, which calls the Flask API in server/.
"""
import time

import api_client
import intents

PENDING_TTL_SECONDS = 600  # 10 minutes

HELP_TEXT = (
    "I can: pick the best card for a purchase (\"use at Target for $42\"), "
    "turn Debt Guard on/off, tell you what's due soon, log a payment you already made, "
    "show how much you've saved, or answer credit questions. Just ask."
)


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


def handle_pick(storage, sender, parsed):
    merchant = parsed.get("merchant")
    amount = parsed.get("amount")
    if amount is None:
        return "How much is the purchase, and where?"
    try:
        result = api_client.pick(merchant=merchant, amount=amount)
    except api_client.ApiError as e:
        return str(e)
    set_last_pick(storage, sender, merchant, amount)
    return format_pick(result, merchant, amount)


def handle_debt_guard(storage, sender, enabled):
    try:
        api_client.set_debt_guard(enabled)
    except api_client.ApiError as e:
        return str(e)
    reply = f"Debt Guard is now {'on' if enabled else 'off'}."
    last_pick = get_last_pick(storage, sender)
    if last_pick and last_pick.get("amount") is not None:
        try:
            result = api_client.pick(merchant=last_pick.get("merchant"), amount=last_pick["amount"])
            reply += " Same purchase, new pick: " + format_pick(result, last_pick.get("merchant"),
                                                                  last_pick["amount"])
        except api_client.ApiError:
            pass
    return reply


def handle_notifications(storage, sender):
    try:
        notes = api_client.get_notifications()
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


def handle_confirm_yes(storage, sender):
    pending = get_pending(storage, sender)
    if not pending:
        return "I don't have anything waiting on a yes right now."
    try:
        result = api_client.approve_notification(pending["note_id"])
    except api_client.ApiError as e:
        return str(e)
    clear_pending(storage, sender)
    if result is None:
        return "That one's already handled."
    return result.get("message", "Done.")


def handle_confirm_no(storage, sender):
    pending = get_pending(storage, sender)
    if not pending:
        return "Okay."
    try:
        api_client.dismiss_notification(pending["note_id"])
    except api_client.ApiError as e:
        return str(e)
    clear_pending(storage, sender)
    return "Okay, skipping that for now."


def handle_pay(parsed):
    merchant, amount, card = parsed.get("merchant"), parsed.get("amount"), parsed.get("card")
    if amount is None:
        return "How much did you pay, and where?"
    try:
        result = api_client.pay(merchant=merchant, amount=amount, card_id=card)
    except api_client.ApiError as e:
        return str(e)
    return result.get("message") or f"Logged ${amount:.2f} at {merchant or 'that purchase'}."


def handle_impact():
    try:
        result = api_client.impact()
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


def build_reply(sender, text, storage):
    """Text + per-sender storage in, reply string out."""
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
        return handle_pick(storage, sender, parsed)
    if intent == "debt_guard_on":
        return handle_debt_guard(storage, sender, True)
    if intent == "debt_guard_off":
        return handle_debt_guard(storage, sender, False)
    if intent == "notifications":
        return handle_notifications(storage, sender)
    if intent == "confirm_yes":
        return handle_confirm_yes(storage, sender)
    if intent == "confirm_no":
        return handle_confirm_no(storage, sender)
    if intent == "pay":
        return handle_pay(parsed)
    if intent == "impact":
        return handle_impact()
    if intent == "coach":
        return handle_coach(parsed.get("question") or text)
    if intent == "reset_demo":
        return handle_reset_demo()
    return "Not sure what you mean. Say \"help\" to see what I can do."
