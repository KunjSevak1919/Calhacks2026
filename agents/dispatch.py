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
from datetime import date as _date

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
    SpecialistDelegate falls back to when a specialist doesn't answer.

    Reads (score_pick, due_soon, impact) take a request_id, fresh per call --
    a retry is harmless, so no special care is needed. Writes (execute_action,
    pay) take an action_id instead: a stable id for one logical user-approved
    action, reused across any internal retry/fallback attempt, so logs from
    both paths ("tried the specialist", "fell back to direct") read as one
    story instead of two unrelated calls."""

    async def score_pick(self, request_id, merchant, amount, debt_guard=None):
        return api_client.pick(merchant=merchant, amount=amount, debt_guard=debt_guard)

    async def due_soon(self, request_id):
        return api_client.get_notifications()

    async def execute_action(self, action_id, sender, action, note_id):
        if action == "approve":
            return api_client.approve_notification(note_id)
        return api_client.dismiss_notification(note_id)

    async def pay(self, action_id, merchant, amount, card):
        return api_client.pay(merchant=merchant, amount=amount, card_id=card)

    async def impact(self, request_id):
        return api_client.impact()

    async def resolve_merchant(self, request_id, merchant):
        """No standalone "resolve" endpoint exists on the server, so this
        reuses /api/pick (amount=0.0 is harmless -- pick() is a pure
        computation, not a mutation) purely to read back its "store" field,
        same read-only reuse pattern as everywhere else in this file."""
        result = api_client.pick(merchant=merchant, amount=0.0)
        return result.get("store")


def conversation_key(sender, session):
    """One chat = one sender in one session. Pending approvals and last
    purchase are stored under this, so someone else who knows (or shares)
    the session id still can't approve another sender's action."""
    return f"{sender}:{session}"


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


def set_pending(storage, sender, action, note):
    """Stores the full note (not just its id) and a stable action_id, so
    that if we ever have to confirm "did this already happen?" after a
    specialist's reply arrives late, we can still reconstruct the exact
    "Done. ..." message from the same data we used to propose it -- no
    second write call required."""
    storage.set(_pending_key(sender), {
        "action": action, "note": note, "action_id": str(uuid.uuid4()),
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
    note = (result.get("store") or {}).get("note")
    if note:
        reply += f" ({note}.)"
    return reply


def _format_notification(note):
    title = note["title"]
    sep = "" if title.endswith((".", "!", "?")) else "."
    return f"{title}{sep} {note['body']}"


def _nice_date(iso):
    try:
        d = _date.fromisoformat(iso)
    except (TypeError, ValueError):
        return iso or ""
    return f"{d:%b} {d.day}"


def _propose_action(note):
    """A single concrete, forwardable action sentence for this alert, or
    None if this kind doesn't have one (e.g. an annual-fee review -- there's
    nothing to say "yes" to)."""
    data = note.get("data") or {}
    if note["kind"] == "due":
        amount, name, when = data.get("suggested"), data.get("name"), data.get("pay_on")
        if amount is not None and name and when:
            return f"Reply yes to schedule ${amount:,.0f} to {name} on {_nice_date(when)}."
    elif note["kind"] == "subscription":
        return "Reply yes to cancel it."
    return None


def _action_done_message(note):
    """The same "Done. ..." text a real approve/dismiss call would have
    returned, reconstructed from the note's own data. Used when we can't
    get that text from a fresh call -- either because a specialist's reply
    arrived too late and we deliberately didn't retry (see SpecialistDelegate
    in pocket_pilot_agent.py), or because a retry did happen and the server
    said "not found" (it already happened moments earlier)."""
    data = note.get("data") or {}
    if note["kind"] == "due":
        amount, name, when = data.get("suggested"), data.get("name"), data.get("pay_on")
        if amount is not None and name and when:
            return f"Scheduled ${amount:,.0f} to {name} on {_nice_date(when)}."
    elif note["kind"] == "subscription":
        name, amount = data.get("name"), data.get("amount")
        if name and amount is not None:
            return f"Canceled {name}, saving ${amount:.2f} a month."
        if name:
            return f"Canceled {name}."
    return "Done."


def _format_debt_guard_pick(result):
    """Names the new card first, then -- if a different card would have
    earned more in rewards -- says what that card would have cost in
    interest, so the trade-off is explicit instead of a vague re-pick."""
    ranked = result["ranked"]
    best = ranked[0]
    reply = f"Use {best['name']} instead."
    if ranked and all(c.get("reward") is not None for c in ranked):
        top_reward = max(ranked, key=lambda c: c["reward"])
        if top_reward["name"] != best["name"] and top_reward.get("interest") is not None:
            reply += (f" {top_reward['name']} would earn ${top_reward['reward']:.2f}, but its "
                      f"{top_reward.get('apr', 0):g}% APR would cost ${top_reward['interest']:.2f} "
                      "over 3 months.")
    return reply


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
    reply = f"Debt Guard is {'on' if enabled else 'off'}."
    last_pick = get_last_pick(storage, sender)
    if last_pick and last_pick.get("amount") is not None:
        try:
            request_id = str(uuid.uuid4())
            result = await delegate.score_pick(request_id, last_pick.get("merchant"), last_pick["amount"])
            if enabled:
                reply += " " + _format_debt_guard_pick(result)
            else:
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
    reply = " ".join(_format_notification(n) for n in top)
    action = _propose_action(top[0])
    if action:
        set_pending(storage, sender, "approve", top[0])
        reply += " " + action
    return reply


WRITE_FAILED_MESSAGE = "I couldn't do that, so nothing was paid. Try again."
DISMISS_FAILED_MESSAGE = "I couldn't do that, so nothing changed. Try again."

NOTHING_PENDING_MESSAGE = (
    "There's nothing waiting for your OK right now. "
    "Ask \"anything due soon?\" to see what I can do."
)


async def handle_confirm_yes(storage, sender, delegate):
    pending = get_pending(storage, sender)
    if not pending:
        return NOTHING_PENDING_MESSAGE
    note = pending["note"]
    action_id = pending["action_id"]
    try:
        result = await delegate.execute_action(action_id, sender, "approve", note["id"])
    except api_client.ApiError as e:
        if not e.not_found:
            logger.warning("approve %s failed: %s", note["id"], e)
            return WRITE_FAILED_MESSAGE  # pending kept, so "yes" can retry
        # The server says it's gone -- in this flow that only happens because
        # it was already approved a moment earlier (e.g. a specialist's reply
        # arrived after our timeout and we'd already treated this as done).
        # That's a success, not an error: fall through and report it as one.
        result = None
    clear_pending(storage, sender)
    message = (result or {}).get("message") if result else None
    message = message or _action_done_message(note)
    sep = "" if message.endswith((".", "!", "?")) else "."
    reply = f"Done. {message}{sep}"

    try:
        notes = await delegate.due_soon(str(uuid.uuid4()))
    except api_client.ApiError:
        notes = None
    if notes:
        nxt = notes[0]
        reply += f" Next: {_format_notification(nxt)}"
        action = _propose_action(nxt)
        if action:
            set_pending(storage, sender, "approve", nxt)
            reply += " " + action
    return reply


async def handle_confirm_no(storage, sender, delegate):
    pending = get_pending(storage, sender)
    if not pending:
        return "Okay."
    note = pending["note"]
    action_id = pending["action_id"]
    try:
        await delegate.execute_action(action_id, sender, "dismiss", note["id"])
    except api_client.ApiError as e:
        if not e.not_found:
            logger.warning("dismiss %s failed: %s", note["id"], e)
            return DISMISS_FAILED_MESSAGE
        # Already gone -- already dismissed/handled, which is fine.
    clear_pending(storage, sender)
    return "Okay, skipping that for now."


async def handle_pay(parsed, delegate):
    merchant, amount, card = parsed.get("merchant"), parsed.get("amount"), parsed.get("card")
    if amount is None:
        return "How much did you pay, and where?"
    action_id = str(uuid.uuid4())
    try:
        result = await delegate.pay(action_id, merchant, amount, card)
    except api_client.ApiError as e:
        if not e.not_found:
            logger.warning("pay failed: %s", e)
            return WRITE_FAILED_MESSAGE
        result = None
    return (result or {}).get("message") or f"Logged ${amount:.2f} at {merchant or 'that purchase'}."


async def handle_impact(delegate):
    request_id = str(uuid.uuid4())
    try:
        result = await delegate.impact(request_id)
    except api_client.ApiError as e:
        return str(e)
    return result.get("message") or str(result)


async def handle_store_kind(parsed, delegate):
    merchant = parsed.get("merchant")
    if not merchant:
        return "Which store do you mean?"
    request_id = str(uuid.uuid4())
    try:
        store = await delegate.resolve_merchant(request_id, merchant)
    except api_client.ApiError as e:
        return str(e)
    if not store or not store.get("mcc"):
        return f"I'm not sure what kind of store {merchant} is."
    note = store.get("note")
    if note:
        return f"{merchant}: {note}."
    label = store.get("label") or "a store"
    return f"{merchant} is a {label.lower()}."


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


def handle_vfc_authorize(parsed):
    """Visa Flexible Credential (simulated): read-only, no approval needed
    since nothing moves money -- it's a what-if, like /api/pick. No
    specialist owns this (same reasoning as coach/reset above), so it's a
    direct Flask call, not routed through a delegate."""
    merchant, amount = parsed.get("merchant"), parsed.get("amount")
    if amount is None:
        return "How much is the purchase, and where?"
    try:
        result = api_client.vfc_authorize(merchant=merchant, amount=amount)
    except api_client.ApiError as e:
        return str(e)
    return result.get("reason") or "Not sure how to fund that purchase."


def handle_vfc_rules():
    try:
        result = api_client.vfc_rules()
    except api_client.ApiError as e:
        return str(e)
    lines = [r["then"] for r in result.get("rules", [])]
    numbered = " ".join(f"{i + 1}) {line}." for i, line in enumerate(lines))
    return f"Your Visa Flexible rules (simulated, not a real Visa API): {numbered}"


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
    if intent == "store_kind":
        return await handle_store_kind(parsed, delegate)
    if intent == "coach":
        return handle_coach(parsed.get("question") or text)
    if intent == "reset_demo":
        return handle_reset_demo()
    if intent == "vfc_authorize":
        return handle_vfc_authorize(parsed)
    if intent == "vfc_rules":
        return handle_vfc_rules()
    return "Not sure what you mean. Say \"help\" to see what I can do."
