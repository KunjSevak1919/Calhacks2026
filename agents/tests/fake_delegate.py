"""A hand-rolled fake implementing dispatch.py's delegate interface, so tests
can simulate "a specialist answered" or "a specialist timed out and we fell
back to the direct API" without needing a live uagents runtime."""
import api_client


class FakeDelegate:
    """Records every call so tests can assert the delegate (not api_client
    directly) was used, and returns whatever canned result was configured."""

    def __init__(self, score_pick_result=None, due_soon_result=None,
                 execute_action_result=None, pay_result=None, impact_result=None):
        self.score_pick_result = score_pick_result
        self.due_soon_result = due_soon_result
        self.execute_action_result = execute_action_result
        self.pay_result = pay_result
        self.impact_result = impact_result
        self.calls = []

    async def score_pick(self, request_id, merchant, amount, debt_guard=None):
        self.calls.append(("score_pick", merchant, amount, debt_guard))
        return self.score_pick_result

    async def due_soon(self, request_id):
        self.calls.append(("due_soon",))
        return self.due_soon_result

    async def execute_action(self, request_id, sender, action, note_id):
        self.calls.append(("execute_action", sender, action, note_id))
        return self.execute_action_result

    async def pay(self, request_id, merchant, amount, card):
        self.calls.append(("pay", merchant, amount, card))
        return self.pay_result

    async def impact(self, request_id):
        self.calls.append(("impact",))
        return self.impact_result


class TimeoutThenDirectDelegate:
    """Mirrors what the real SpecialistDelegate does: "tries" a specialist
    (always times out here), then falls back to calling api_client directly
    -- the same path DirectDelegate would take. Used to prove dispatch.py is
    indifferent to which path produced the dict it gets back."""

    def __init__(self):
        self.specialist_attempts = 0

    async def score_pick(self, request_id, merchant, amount, debt_guard=None):
        self.specialist_attempts += 1  # simulated timeout, no response
        return api_client.pick(merchant=merchant, amount=amount, debt_guard=debt_guard)

    async def due_soon(self, request_id):
        self.specialist_attempts += 1
        return api_client.get_notifications()

    async def execute_action(self, request_id, sender, action, note_id):
        self.specialist_attempts += 1
        if action == "approve":
            return api_client.approve_notification(note_id)
        return api_client.dismiss_notification(note_id)

    async def pay(self, request_id, merchant, amount, card):
        self.specialist_attempts += 1
        return api_client.pay(merchant=merchant, amount=amount, card_id=card)

    async def impact(self, request_id):
        self.specialist_attempts += 1
        return api_client.impact()
