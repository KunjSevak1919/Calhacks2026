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

DUE_NOTE = {"id": "due-card1", "kind": "due", "title": "Card1 is due soon",
            "body": "Pay $50 on Friday.", "actions": ["Approve", "Later"],
            "data": {"name": "Card1", "suggested": 50, "pay_on": "2026-10-29"}}

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


def test_pick_api_down(monkeypatch):
    storage = FakeStorage()

    def boom(**kw):
        raise api_client.ApiError("Can't reach Pocket Pilot's server at http://x.")

    monkeypatch.setattr(api_client, "pick", boom)
    reply = run(dispatch.build_reply("alice", "use at Target for $10", storage))
    assert "Can't reach" in reply


def test_confirm_no_dismisses_pending(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    dismissed = {}
    monkeypatch.setattr(api_client, "dismiss_notification",
                         lambda note_id: dismissed.setdefault("id", note_id))
    reply = run(dispatch.build_reply("alice", "no", storage))
    assert dismissed["id"] == "due-card1"
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
    assert reply == ("Card1 is due soon. Pay $50 on Friday. "
                      "Reply yes to schedule $50 to Card1 on Oct 29.")
    pending = dispatch.get_pending(storage, "alice")
    assert pending["note_id"] == "due-card1"


def test_notifications_proposes_cancel_for_subscription(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "get_notifications", lambda: [SUBSCRIPTION_TRIAL_NOTE])
    reply = run(dispatch.build_reply("alice", "anything due soon?", storage))
    assert reply.endswith("Reply yes to cancel it.")
    assert dispatch.get_pending(storage, "alice")["note_id"] == "sub-streambox"


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
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    stored = storage.get("pending:alice")
    stored["expires_at"] = time.time() - 1  # force expiry
    storage.set("pending:alice", stored)

    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert reply == dispatch.NOTHING_PENDING_MESSAGE


def test_other_sender_cannot_approve_pending_action():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")

    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("bob", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert reply == dispatch.NOTHING_PENDING_MESSAGE
    # alice's pending action is untouched
    assert dispatch.get_pending(storage, "alice") is not None


# ---------- "yes" after an @-mention, as ASI:One actually sends it ----------

def test_confirm_yes_with_asi_one_mention_prefix(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    monkeypatch.setattr(api_client, "approve_notification",
                         lambda note_id: {"id": note_id, "message": "Scheduled $50 to Card1"})
    mention = "@agent1qde95qr0dzcnhhs8f65hkwujn9mh89jx0u7u7g6nv3tm2jxvjwhkunvessq yes"
    reply = run(dispatch.build_reply("alice", mention, storage))
    assert "Scheduled $50" in reply
    assert dispatch.get_pending(storage, "alice") is None


def test_confirm_no_with_asi_one_mention_prefix(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
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
    """Mirrors what the real SpecialistDelegate does on a 5s timeout: tries
    the specialist, gets nothing back, falls back to the Flask API -- and
    dispatch.py still produces a correct reply either way."""
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "pick", lambda **kw: PICK_RESULT)
    delegate = TimeoutThenDirectDelegate()
    reply = run(dispatch.build_reply("alice", "use at Whole Foods for $84.50", storage, delegate=delegate))
    assert "Zero Intro" in reply
    assert delegate.specialist_attempts == 1


def test_execute_action_routes_through_delegate_on_approve():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    delegate = FakeDelegate(execute_action_result={"message": "Scheduled $50 to Card1"})
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert "Done. Scheduled $50 to Card1" in reply
    assert ("execute_action", "alice", "approve", "due-card1") in delegate.calls
    assert dispatch.get_pending(storage, "alice") is None


def test_confirm_yes_chains_to_next_alert(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    monkeypatch.setattr(api_client, "approve_notification",
                         lambda note_id: {"id": note_id, "message": "Scheduled $640 to Aurum Gold on Oct 29"})
    monkeypatch.setattr(api_client, "get_notifications", lambda: [SUBSCRIPTION_TRIAL_NOTE])
    reply = run(dispatch.build_reply("alice", "yes", storage))
    assert reply == ("Done. Scheduled $640 to Aurum Gold on Oct 29. "
                      "Next: Free trial converts tomorrow. StreamBox starts charging $15.99 tomorrow. "
                      "Reply yes to cancel it.")
    pending = dispatch.get_pending(storage, "alice")
    assert pending["note_id"] == "sub-streambox"


def test_confirm_yes_no_next_alert_when_queue_empty(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    monkeypatch.setattr(api_client, "approve_notification",
                         lambda note_id: {"id": note_id, "message": "Scheduled $50 to Card1"})
    monkeypatch.setattr(api_client, "get_notifications", lambda: [])
    reply = run(dispatch.build_reply("alice", "yes", storage))
    assert reply == "Done. Scheduled $50 to Card1."
