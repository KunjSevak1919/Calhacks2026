"""SpecialistDelegate's write paths: a specialist's "not found" means already
done; any other failure it reports is raised, never retried, never "Done"."""
import asyncio
import logging

import pytest

import api_client
import messages
import pocket_pilot_agent


class FakeCtx:
    def __init__(self, response):
        self.response = response
        self.logger = logging.getLogger("test")

    async def send_and_receive(self, destination, req, response_type, timeout):
        return self.response, None


def run(coro):
    return asyncio.run(coro)


def _no_direct_calls(monkeypatch):
    def fail(*a, **kw):
        raise AssertionError("must not retry the write directly")

    for name in ("approve_notification", "dismiss_notification", "pay", "get_notifications"):
        monkeypatch.setattr(api_client, name, fail)


def test_execute_action_not_found_counts_as_done(monkeypatch):
    _no_direct_calls(monkeypatch)
    resp = messages.ExecuteActionResponse(request_id="a", ok=False, error="gone", not_found=True)
    delegate = pocket_pilot_agent.SpecialistDelegate(FakeCtx(resp))
    assert run(delegate.execute_action("a", "alice", "approve", "due-aurum")) is None


def test_execute_action_other_failure_raises(monkeypatch):
    _no_direct_calls(monkeypatch)
    resp = messages.ExecuteActionResponse(request_id="a", ok=False, error="unauthorized")
    delegate = pocket_pilot_agent.SpecialistDelegate(FakeCtx(resp))
    with pytest.raises(api_client.ApiError) as exc:
        run(delegate.execute_action("a", "alice", "approve", "due-aurum"))
    assert not exc.value.not_found


def test_pay_other_failure_raises_without_retry(monkeypatch):
    _no_direct_calls(monkeypatch)
    resp = messages.PayResponse(request_id="p", ok=False, error="server down")
    delegate = pocket_pilot_agent.SpecialistDelegate(FakeCtx(resp))
    with pytest.raises(api_client.ApiError):
        run(delegate.pay("p", "Target", 40.0, None))


def test_pay_not_found_counts_as_done(monkeypatch):
    _no_direct_calls(monkeypatch)
    resp = messages.PayResponse(request_id="p", ok=False, error="gone", not_found=True)
    delegate = pocket_pilot_agent.SpecialistDelegate(FakeCtx(resp))
    assert run(delegate.pay("p", "Target", 40.0, None)) is None


def test_due_soon_via_planner_keeps_note_data_so_yes_can_be_offered():
    """The approve prompt ("Reply yes to schedule $640 ...") is built from
    note["data"]; it must survive the agent-message hop."""
    import dispatch
    from fake_storage import FakeStorage

    note = messages.NotificationSummary(
        id="due-aurum", kind="due", title="Aurum Gold is due Oct 30", body="Pay $640 on Oct 29?",
        actions=["Approve", "Later"],
        data={"name": "Aurum Gold", "suggested": 640.0, "pay_on": "2026-10-29"})
    resp = messages.DueSoonResponse(request_id="d", ok=True, notifications=[note])
    resp = messages.DueSoonResponse.parse_raw(resp.json())  # as it crosses the wire
    delegate = pocket_pilot_agent.SpecialistDelegate(FakeCtx(resp))
    reply = run(dispatch.build_reply("alice:s1", "anything due soon?", FakeStorage(), delegate=delegate))
    assert reply.endswith("Reply yes to schedule $640 to Aurum Gold on Oct 29.")


def test_read_fallback_log_says_whether_the_specialist_answered(monkeypatch, caplog):
    monkeypatch.setattr(api_client, "impact", lambda: {"message": "Saved $55."})
    resp = messages.ImpactResponse(request_id="i", ok=False, error="/api/impact isn't available")
    delegate = pocket_pilot_agent.SpecialistDelegate(FakeCtx(resp))
    with caplog.at_level(logging.INFO, logger="test"):
        assert run(delegate.impact("i")) == {"message": "Saved $55."}
    assert "answered with an error (/api/impact isn't available), falling back" in caplog.text
    assert "unreachable" not in caplog.text
