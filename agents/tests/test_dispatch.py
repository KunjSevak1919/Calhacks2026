import asyncio
import time

import api_client
import dispatch
from fake_delegate import FakeDelegate, TimeoutThenDirectDelegate
from fake_storage import FakeStorage


def run(coro):
    return asyncio.run(coro)


PICK_RESULT = {
    "best": {"name": "Zero Intro", "rate_label": "3% groceries"},
    "ranked": [
        {"name": "Zero Intro", "rate_label": "3% groceries"},
        {"name": "Travel Plus", "rate_label": "1% flat"},
    ],
    "reason": "Zero Intro earns 3% at Whole Foods.",
}

# Matches the live bug report's numbers exactly: turning Debt Guard on should
# name the new card first, then explain what the higher-reward card would
# have cost in interest.
DEBT_GUARD_PICK_RESULT = {
    "best": {"name": "Zero Intro", "rate_label": "0% intro APR",
              "reward": 2.00, "interest": 0.0, "apr": 0.0, "net": 2.00},
    "ranked": [
        {"name": "Zero Intro", "rate_label": "0% intro APR",
         "reward": 2.00, "interest": 0.0, "apr": 0.0, "net": 2.00},
        {"name": "Aurum Gold", "rate_label": "4% on grocery",
         "reward": 3.38, "interest": 6.32, "apr": 29.9, "net": -2.94},
    ],
    "reason": "irrelevant for this path",
}

# Mirrors the real due-aurum notification confirmed live against the server:
# $640 to Aurum Gold on Oct 29 -- the exact numbers from the bug report.
DUE_NOTE = {"id": "due-aurum", "kind": "due", "title": "Aurum Gold is due Oct 30",
            "body": "Pay $640 on Oct 29, after payday?",
            "actions": ["Approve", "Later"],
            "data": {"name": "Aurum Gold", "suggested": 640, "pay_on": "2026-10-29"}}

SUBSCRIPTION_UNUSED_NOTE = {"id": "sub-gymly", "kind": "subscription", "title": "Still using Gymly?",
                            "body": "$15.99 a month, not used in 20 days.",
                            "actions": ["Cancel", "Keep it"], "data": {"name": "Gymly"}}

SUBSCRIPTION_TRIAL_NOTE = {"id": "sub-streambox", "kind": "subscription",
                           "title": "Free trial converts tomorrow",
                           "body": "StreamBox starts charging $15.99 tomorrow.",
                           "actions": ["Cancel trial", "Keep it"], "data": {"name": "StreamBox"}}

ANNUAL_FEE_NOTE = {"id": "fee-card1", "kind": "annual_fee",
                   "title": "Is your $95 Aurum Gold fee worth it?",
                   "body": "It earned you $120 this year.",
                   "actions": ["See options", "Ask Coach"], "data": {}}


# ---------- default delegate (DirectDelegate): same behavior as before any
# specialist agents existed, just now routed through the delegate interface ----------

def test_pick_success(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "pick", lambda **kw: PICK_RESULT)
    reply = run(dispatch.build_reply("alice", "Which card at Whole Foods for $84.50?", storage))
    assert "Zero Intro" in reply
    assert "Travel Plus" in reply


def test_pick_mentions_store_note_briefly(monkeypatch):
    storage = FakeStorage()
    pick_with_note = {**PICK_RESULT, "store": {"note": "Warehouse club, not grocery"}}
    monkeypatch.setattr(api_client, "pick", lambda **kw: pick_with_note)
    reply = run(dispatch.build_reply("alice", "use at Costco for $42", storage))
    assert "(Warehouse club, not grocery.)" in reply


def test_pick_api_down(monkeypatch):
    storage = FakeStorage()

    def boom(**kw):
        raise api_client.ApiError("Can't reach Pocket Pilot's server at http://x.")

    monkeypatch.setattr(api_client, "pick", boom)
    reply = run(dispatch.build_reply("alice", "use at Target for $10", storage))
    assert "Can't reach" in reply


def test_confirm_no_dismisses_pending(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    dismissed = {}
    monkeypatch.setattr(api_client, "dismiss_notification",
                         lambda note_id: dismissed.setdefault("id", note_id))
    reply = run(dispatch.build_reply("alice", "no", storage))
    assert dismissed["id"] == "due-aurum"
    assert dispatch.get_pending(storage, "alice") is None
    assert "Okay" in reply


def test_debt_guard_off_repicks_last_purchase(monkeypatch):
    storage = FakeStorage()
    dispatch.set_last_pick(storage, "alice", "Whole Foods", 84.5)
    monkeypatch.setattr(api_client, "set_debt_guard", lambda enabled: {"debt_guard": enabled})
    monkeypatch.setattr(api_client, "pick", lambda **kw: PICK_RESULT)
    reply = run(dispatch.build_reply("alice", "turn off debt guard", storage))
    assert "Debt Guard is off." in reply
    assert "Same purchase, new pick" in reply
    assert "Zero Intro" in reply


def test_coach_question(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "ask_coach",
                         lambda q, history=None: {"answer": "Late fees happen after the due date."})
    reply = run(dispatch.build_reply("alice", "how do late fees work?", storage))
    assert "Late fees" in reply


def test_missing_endpoint_is_graceful(monkeypatch):
    storage = FakeStorage()

    def missing(**kw):
        raise api_client.ApiError("/api/impact isn't available on this server yet.", status_code=404)

    monkeypatch.setattr(api_client, "impact", missing)
    reply = run(dispatch.build_reply("alice", "how much have you saved me?", storage))
    assert "isn't available" in reply


# ---------- debt guard ON: names the new card first, then the cost trade-off ----------

def test_debt_guard_on_names_new_card_first_with_cost_tradeoff(monkeypatch):
    storage = FakeStorage()
    dispatch.set_last_pick(storage, "alice", "Whole Foods", 84.5)
    monkeypatch.setattr(api_client, "set_debt_guard", lambda enabled: {"debt_guard": enabled})
    monkeypatch.setattr(api_client, "pick", lambda **kw: DEBT_GUARD_PICK_RESULT)
    reply = run(dispatch.build_reply("alice", "I'm carrying a balance", storage))
    assert reply == ("Debt Guard is on. Use Zero Intro instead. Aurum Gold would earn $3.38, "
                      "but its 29.9% APR would cost $6.32 over 3 months.")


def test_debt_guard_on_skips_tradeoff_when_same_card_wins(monkeypatch):
    storage = FakeStorage()
    dispatch.set_last_pick(storage, "alice", "Whole Foods", 84.5)
    monkeypatch.setattr(api_client, "set_debt_guard", lambda enabled: {"debt_guard": enabled})
    monkeypatch.setattr(api_client, "pick", lambda **kw: PICK_RESULT)  # no reward/apr fields
    reply = run(dispatch.build_reply("alice", "turn on debt guard", storage))
    assert reply == "Debt Guard is on. Use Zero Intro instead."


# ---------- notifications: concrete action proposals, no vague "take care of it?" ----------

def test_notifications_proposes_one_concrete_action_for_due(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "get_notifications", lambda: [DUE_NOTE])
    reply = run(dispatch.build_reply("alice", "anything due soon?", storage))
    assert reply == ("Aurum Gold is due Oct 30. Pay $640 on Oct 29, after payday? "
                      "Reply yes to schedule $640 to Aurum Gold on Oct 29.")
    pending = dispatch.get_pending(storage, "alice")
    assert pending["note"]["id"] == "due-aurum"


def test_notifications_proposes_cancel_for_subscription(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "get_notifications", lambda: [SUBSCRIPTION_TRIAL_NOTE])
    reply = run(dispatch.build_reply("alice", "anything due soon?", storage))
    assert reply.endswith("Reply yes to cancel it.")
    assert dispatch.get_pending(storage, "alice")["note"]["id"] == "sub-streambox"


def test_notification_punctuation_has_no_double_period(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "get_notifications", lambda: [SUBSCRIPTION_UNUSED_NOTE])
    reply = run(dispatch.build_reply("alice", "anything due soon?", storage))
    assert "Gymly?." not in reply
    assert "Still using Gymly? $15.99 a month, not used in 20 days." in reply


def test_notifications_informational_kind_has_no_pending_prompt(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "get_notifications", lambda: [ANNUAL_FEE_NOTE])
    reply = run(dispatch.build_reply("alice", "anything due soon?", storage))
    assert "Reply yes" not in reply
    assert "(yes/no)" not in reply
    assert dispatch.get_pending(storage, "alice") is None


# ---------- confirmation gating: no action without a forwarded yes from the
# same sender, regardless of whether the executor is a specialist or direct ----------

def test_confirm_yes_without_pending_gives_helpful_message():
    storage = FakeStorage()
    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert reply == dispatch.NOTHING_PENDING_MESSAGE
    assert "Not sure what you mean" not in reply


def test_pending_expires_after_ttl_never_calls_delegate():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    stored = storage.get("pending:alice")
    stored["expires_at"] = time.time() - 1  # force expiry
    storage.set("pending:alice", stored)

    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert reply == dispatch.NOTHING_PENDING_MESSAGE


def test_other_sender_cannot_approve_pending_action():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)

    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("bob", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert reply == dispatch.NOTHING_PENDING_MESSAGE
    # alice's pending action is untouched
    assert dispatch.get_pending(storage, "alice") is not None


# ---------- "yes" after an @-mention, as ASI:One actually sends it ----------

def test_confirm_yes_with_asi_one_mention_prefix(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    monkeypatch.setattr(api_client, "approve_notification",
                         lambda note_id: {"id": note_id, "message": "Scheduled $640 to Aurum Gold on Oct 29"})
    monkeypatch.setattr(api_client, "get_notifications", lambda: [])
    mention = "@agent1qde95qr0dzcnhhs8f65hkwujn9mh89jx0u7u7g6nv3tm2jxvjwhkunvessq yes"
    reply = run(dispatch.build_reply("alice", mention, storage))
    assert "Scheduled $640" in reply
    assert dispatch.get_pending(storage, "alice") is None


def test_confirm_no_with_asi_one_mention_prefix(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    monkeypatch.setattr(api_client, "dismiss_notification", lambda note_id: {"message": "Dismissed"})
    mention = "@agent1qde95qr0dzcnhhs8f65hkwujn9mh89jx0u7u7g6nv3tm2jxvjwhkunvessq no"
    reply = run(dispatch.build_reply("alice", mention, storage))
    assert "Okay" in reply
    assert dispatch.get_pending(storage, "alice") is None


# ---------- delegation: a specialist can answer, or dispatch falls back ----------

def test_delegation_happy_path_skips_direct_api(monkeypatch):
    storage = FakeStorage()

    def fail_if_called(**kw):
        raise AssertionError("api_client.pick should not be called when a delegate answers")

    monkeypatch.setattr(api_client, "pick", fail_if_called)
    delegate = FakeDelegate(score_pick_result=PICK_RESULT)
    reply = run(dispatch.build_reply("alice", "use at Whole Foods for $84.50", storage, delegate=delegate))
    assert "Zero Intro" in reply
    assert delegate.calls == [("score_pick", "Whole Foods", 84.50, None)]


def test_delegate_timeout_falls_back_to_direct_api(monkeypatch):
    """Mirrors what the real SpecialistDelegate does when a read specialist
    doesn't answer in time: tries the specialist, gets nothing back, falls
    back to the Flask API -- and dispatch.py still produces a correct reply
    either way."""
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "pick", lambda **kw: PICK_RESULT)
    delegate = TimeoutThenDirectDelegate()
    reply = run(dispatch.build_reply("alice", "use at Whole Foods for $84.50", storage, delegate=delegate))
    assert "Zero Intro" in reply
    assert delegate.specialist_attempts == 1


def test_execute_action_routes_through_delegate_on_approve():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    delegate = FakeDelegate(execute_action_result={"message": "Scheduled $640 to Aurum Gold on Oct 29"})
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert "Done. Scheduled $640 to Aurum Gold on Oct 29" in reply
    assert ("execute_action", "alice", "approve", "due-aurum") in delegate.calls
    assert dispatch.get_pending(storage, "alice") is None


def test_confirm_yes_chains_to_next_alert(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    monkeypatch.setattr(api_client, "approve_notification",
                         lambda note_id: {"id": note_id, "message": "Scheduled $640 to Aurum Gold on Oct 29"})
    monkeypatch.setattr(api_client, "get_notifications", lambda: [SUBSCRIPTION_TRIAL_NOTE])
    reply = run(dispatch.build_reply("alice", "yes", storage))
    assert reply == ("Done. Scheduled $640 to Aurum Gold on Oct 29. "
                      "Next: Free trial converts tomorrow. StreamBox starts charging $15.99 tomorrow. "
                      "Reply yes to cancel it.")
    pending = dispatch.get_pending(storage, "alice")
    assert pending["note"]["id"] == "sub-streambox"


def test_confirm_yes_no_next_alert_when_queue_empty(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    monkeypatch.setattr(api_client, "approve_notification",
                         lambda note_id: {"id": note_id, "message": "Scheduled $640 to Aurum Gold on Oct 29"})
    monkeypatch.setattr(api_client, "get_notifications", lambda: [])
    reply = run(dispatch.build_reply("alice", "yes", storage))
    assert reply == "Done. Scheduled $640 to Aurum Gold on Oct 29."


# ---------- idempotency: never execute a write twice. Reproduces the live bug
# exactly -- Payment Planner's approve succeeded, but its reply crossed the
# mailbox relay late, SpecialistDelegate detected that and returned None
# instead of retrying, and dispatch.py must still say "Done" with the right
# numbers, reconstructed from the pending note it already had. ----------

def test_confirm_yes_reconstructs_done_message_when_delegate_signals_already_done():
    """delegate.execute_action returning None (no retry, no message) is
    exactly what the real SpecialistDelegate does once it confirms via
    GET /api/notifications that the write already happened -- dispatch.py
    must still report success with the right numbers, not an error."""
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)
    delegate = FakeDelegate(execute_action_result=None)
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert reply.startswith("Done. Scheduled $640 to Aurum Gold on Oct 29.")
    assert dispatch.get_pending(storage, "alice") is None


def test_confirm_yes_treats_not_found_error_as_already_done():
    """If a retry does happen and the server says "not found" (confirmed
    live: approving an already-approved id returns 404 {"error": "No
    notification called due-aurum"}), that means it already happened a
    moment earlier -- report success, don't show the user an error."""
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)

    class NotFoundDelegate(FakeDelegate):
        async def execute_action(self, action_id, sender, action, note_id):
            self.calls.append(("execute_action", sender, action, note_id))
            raise api_client.ApiError("I couldn't find that anymore -- it may already be done.",
                                       status_code=404, not_found=True)

    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=NotFoundDelegate()))
    assert reply.startswith("Done. Scheduled $640 to Aurum Gold on Oct 29.")
    assert dispatch.get_pending(storage, "alice") is None


def test_confirm_yes_still_surfaces_real_errors():
    """A genuine failure (not a 404-because-already-done) is still shown as
    an error, and the pending action is kept so the user can retry."""
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)

    class BoomDelegate(FakeDelegate):
        async def execute_action(self, action_id, sender, action, note_id):
            raise api_client.ApiError("Can't reach Pocket Pilot's server.")

    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=BoomDelegate()))
    assert "Can't reach" in reply
    assert dispatch.get_pending(storage, "alice") is not None


def test_confirm_no_treats_not_found_error_as_already_handled():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", DUE_NOTE)

    class NotFoundDelegate(FakeDelegate):
        async def execute_action(self, action_id, sender, action, note_id):
            raise api_client.ApiError("gone", status_code=404, not_found=True)

    reply = run(dispatch.build_reply("alice", "no", storage, delegate=NotFoundDelegate()))
    assert "Okay" in reply
    assert dispatch.get_pending(storage, "alice") is None


# ---------- "what kind of store is X" -- Merchant Resolver chat intent ----------

def test_store_kind_with_note():
    storage = FakeStorage()
    delegate = FakeDelegate(resolve_merchant_result={
        "category": "warehouse_club", "label": "Warehouse club", "mcc": "5300",
        "confidence": 0.9, "source": "known_merchant", "note": "Warehouse club, not grocery"})
    reply = run(dispatch.build_reply("alice", "What kind of store is Costco?", storage, delegate=delegate))
    assert reply == "Costco: Warehouse club, not grocery."
    assert delegate.calls == [("resolve_merchant", "Costco")]


def test_store_kind_without_note():
    storage = FakeStorage()
    delegate = FakeDelegate(resolve_merchant_result={
        "category": "grocery", "label": "Grocery store", "mcc": "5411",
        "confidence": 0.9, "source": "known_merchant", "note": None})
    reply = run(dispatch.build_reply("alice", "what type of store is Whole Foods", storage, delegate=delegate))
    assert reply == "Whole Foods is a grocery store."


def test_store_kind_unknown_merchant():
    storage = FakeStorage()
    delegate = FakeDelegate(resolve_merchant_result={
        "category": "unknown", "label": "Unknown", "mcc": None, "confidence": 0.3,
        "source": "none", "note": None})
    reply = run(dispatch.build_reply("alice", "what kind of store is Bob's Shop", storage, delegate=delegate))
    assert reply == "I'm not sure what kind of store Bob's Shop is."


def test_store_kind_resolver_down_still_answers_via_fallback(monkeypatch):
    storage = FakeStorage()
    pick_result = {"best": {"name": "x"}, "ranked": [{"name": "x"}],
                   "store": {"category": "warehouse_club", "label": "Warehouse club", "mcc": "5300",
                             "confidence": 0.9, "source": "known_merchant",
                             "note": "Warehouse club, not grocery"}}
    monkeypatch.setattr(api_client, "pick", lambda **kw: pick_result)
    delegate = TimeoutThenDirectDelegate()
    reply = run(dispatch.build_reply("alice", "what kind of store is Costco", storage, delegate=delegate))
    assert reply == "Costco: Warehouse club, not grocery."
    assert delegate.specialist_attempts == 1


# ---------- Visa Flexible Credential (simulated) -- direct Flask calls, no
# specialist owns this, same pattern as coach/reset_demo above. Read-only:
# no pending/confirmation needed since nothing moves money. ----------

VFC_DEBIT_RESULT = {
    "funding": "debit", "card_id": None, "card_name": None, "merchant": "Whole Foods Market",
    "mcc": "5411", "category": "grocery", "mcc_preserved": True, "simulated": True,
    "rule_id": "debit-if-carrying",
    "reason": ("Pay with debit: you're carrying a balance, so credit would start charging "
               "interest today -- debit costs $0 in interest. Checking has $380.00, minus a "
               "$100.00 safety buffer, leaves $280.00 -- enough for $84.50."),
}

VFC_RULES_RESULT = {
    "simulated": True,
    "settings": {"debit_buffer": 100.0, "installment_threshold": 200.0, "enabled": True},
    "rules": [
        {"id": "credit-if-clear", "then": "Pay with CREDIT on your best rewards card for this store's category",
         "when": "...", "why": "..."},
        {"id": "debit-if-carrying", "then": "Pay with DEBIT, straight from checking", "when": "...", "why": "..."},
        {"id": "installments-if-large", "then": "Split into 4 equal INSTALLMENTS, 14 days apart",
         "when": "...", "why": "..."},
        {"id": "credit-lowest-apr-otherwise", "then": "Pay with CREDIT on your lowest-cost card for this balance",
         "when": "...", "why": "..."},
    ],
}


def test_vfc_authorize_surfaces_reason_directly(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "vfc_authorize", lambda **kw: VFC_DEBIT_RESULT)
    reply = run(dispatch.build_reply("alice", "pay with visa flexible at Whole Foods $84.50", storage))
    assert reply == VFC_DEBIT_RESULT["reason"]


def test_vfc_authorize_missing_amount_asks_for_it():
    storage = FakeStorage()
    reply = run(dispatch.build_reply("alice", "how should I pay at Best Buy", storage))
    assert reply == "How much is the purchase, and where?"


def test_vfc_authorize_api_down_is_graceful(monkeypatch):
    storage = FakeStorage()

    def boom(**kw):
        raise api_client.ApiError("Can't reach Pocket Pilot's server at http://x.")

    monkeypatch.setattr(api_client, "vfc_authorize", boom)
    reply = run(dispatch.build_reply("alice", "how should I pay for a $600 laptop at Best Buy?", storage))
    assert "Can't reach" in reply


def test_vfc_rules_summarized(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "vfc_rules", lambda: VFC_RULES_RESULT)
    reply = run(dispatch.build_reply("alice", "show my Visa rules", storage))
    assert reply.startswith("Your Visa Flexible rules (simulated, not a real Visa API):")
    assert "1) Pay with CREDIT on your best rewards card for this store's category." in reply
    assert "3) Split into 4 equal INSTALLMENTS, 14 days apart." in reply
