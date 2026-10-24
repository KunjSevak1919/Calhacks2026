"""Payment Planner accepts writes only from Pocket Pilot's own address.
Calls the real handlers with a tiny fake ctx; the Flask API is mocked."""
import asyncio
import logging

from uagents_core.identity import Identity

import api_client
import payment_planner_agent as planner
from messages import DueSoonRequest, ExecuteActionRequest, ImpactRequest, PayRequest

POCKET_PILOT = Identity.from_seed("test-pocket_pilot_seed", 0).address
STRANGER = Identity.from_seed("someone-else", 0).address


class FakeCtx:
    def __init__(self):
        self.logger = logging.getLogger("test")
        self.sent = []

    async def send(self, destination, message):
        self.sent.append((destination, message))


def run(coro):
    return asyncio.run(coro)


def _approve_req():
    return ExecuteActionRequest(request_id="r1", sender="alice", action="approve", note_id="due-aurum")


def test_pocket_pilot_address_comes_from_its_seed():
    assert planner.POCKET_PILOT_ADDRESS == POCKET_PILOT


def test_execute_action_from_stranger_is_unauthorized(monkeypatch):
    def fail(note_id):
        raise AssertionError("must not write for an untrusted sender")

    monkeypatch.setattr(api_client, "approve_notification", fail)
    ctx = FakeCtx()
    run(planner.handle_execute_action(ctx, STRANGER, _approve_req()))
    (dest, resp), = ctx.sent
    assert dest == STRANGER
    assert resp.ok is False
    assert resp.error == "unauthorized"


def test_execute_action_from_pocket_pilot_runs(monkeypatch):
    monkeypatch.setattr(api_client, "approve_notification",
                        lambda note_id: {"message": "Scheduled $640 to Aurum Gold on Oct 29"})
    ctx = FakeCtx()
    run(planner.handle_execute_action(ctx, POCKET_PILOT, _approve_req()))
    (_dest, resp), = ctx.sent
    assert resp.ok is True
    assert resp.message == "Scheduled $640 to Aurum Gold on Oct 29"


def test_pay_from_stranger_is_unauthorized(monkeypatch):
    def fail(**kw):
        raise AssertionError("must not write for an untrusted sender")

    monkeypatch.setattr(api_client, "pay", fail)
    ctx = FakeCtx()
    run(planner.handle_pay(ctx, STRANGER, PayRequest(request_id="r2", merchant="Target", amount=40.0)))
    (_dest, resp), = ctx.sent
    assert resp.ok is False
    assert resp.error == "unauthorized"


def test_pay_from_pocket_pilot_runs(monkeypatch):
    monkeypatch.setattr(api_client, "pay", lambda **kw: {"message": "Logged $40.00 at Target."})
    ctx = FakeCtx()
    run(planner.handle_pay(ctx, POCKET_PILOT, PayRequest(request_id="r2", merchant="Target", amount=40.0)))
    (_dest, resp), = ctx.sent
    assert resp.ok is True


def test_reads_stay_open_to_any_agent(monkeypatch):
    monkeypatch.setattr(api_client, "get_notifications", lambda: [])
    monkeypatch.setattr(api_client, "impact", lambda: {"message": "Saved $55."})
    ctx = FakeCtx()
    run(planner.handle_due_soon(ctx, STRANGER, DueSoonRequest(request_id="r3")))
    run(planner.handle_impact(ctx, STRANGER, ImpactRequest(request_id="r4")))
    assert [m.ok for _d, m in ctx.sent] == [True, True]


def test_execute_action_not_found_is_flagged(monkeypatch):
    def gone(note_id):
        raise api_client.ApiError("gone", status_code=404, not_found=True)

    monkeypatch.setattr(api_client, "approve_notification", gone)
    ctx = FakeCtx()
    run(planner.handle_execute_action(ctx, POCKET_PILOT, _approve_req()))
    (_dest, resp), = ctx.sent
    assert resp.ok is False
    assert resp.not_found is True


def test_execute_action_real_failure_is_not_flagged_not_found(monkeypatch):
    def boom(note_id):
        raise api_client.ApiError("Can't reach Pocket Pilot's server.")

    monkeypatch.setattr(api_client, "approve_notification", boom)
    ctx = FakeCtx()
    run(planner.handle_execute_action(ctx, POCKET_PILOT, _approve_req()))
    (_dest, resp), = ctx.sent
    assert resp.ok is False
    assert resp.not_found is False
