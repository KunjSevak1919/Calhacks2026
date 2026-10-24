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

NOTIFICATIONS = [
    {"id": "due-card1", "kind": "due", "title": "Card1 is due soon",
     "body": "Pay $50 on Friday.", "actions": ["Approve", "Later"]},
]


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


def test_notifications_sets_pending_and_offers_confirmation(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(api_client, "get_notifications", lambda: NOTIFICATIONS)
    reply = run(dispatch.build_reply("alice", "anything due soon?", storage))
    assert "Card1 is due soon" in reply
    assert "(yes/no)" in reply
    pending = dispatch.get_pending(storage, "alice")
    assert pending["note_id"] == "due-card1"


def test_confirm_yes_executes_pending_action(monkeypatch):
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    monkeypatch.setattr(api_client, "approve_notification",
                         lambda note_id: {"id": note_id, "message": "Scheduled $50 to Card1"})
    reply = run(dispatch.build_reply("alice", "yes", storage))
    assert "Scheduled $50" in reply
    assert dispatch.get_pending(storage, "alice") is None


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


def test_debt_guard_on_repicks_last_purchase(monkeypatch):
    storage = FakeStorage()
    dispatch.set_last_pick(storage, "alice", "Whole Foods", 84.5)
    monkeypatch.setattr(api_client, "set_debt_guard", lambda enabled: {"debt_guard": enabled})
    monkeypatch.setattr(api_client, "pick", lambda **kw: PICK_RESULT)
    reply = run(dispatch.build_reply("alice", "turn on debt guard", storage))
    assert "Debt Guard is now on" in reply
    assert "Same purchase, new pick" in reply


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


# ---------- confirmation gating: no action without a forwarded yes from the
# same sender, regardless of whether the executor is a specialist or direct ----------

def test_confirm_yes_without_pending_never_calls_delegate():
    storage = FakeStorage()
    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert "don't have anything" in reply


def test_pending_expires_after_ttl_never_calls_delegate():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")
    stored = storage.get("pending:alice")
    stored["expires_at"] = time.time() - 1  # force expiry
    storage.set("pending:alice", stored)

    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("alice", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert "don't have anything" in reply


def test_other_sender_cannot_approve_pending_action():
    storage = FakeStorage()
    dispatch.set_pending(storage, "alice", "approve", "due-card1", "Card1 is due soon")

    delegate = FakeDelegate()
    reply = run(dispatch.build_reply("bob", "yes", storage, delegate=delegate))
    assert not delegate.calls
    assert "don't have anything" in reply
    # alice's pending action is untouched
    assert dispatch.get_pending(storage, "alice") is not None


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
    assert "Scheduled $50" in reply
    assert delegate.calls == [("execute_action", "alice", "approve", "due-card1")]
    assert dispatch.get_pending(storage, "alice") is None
