import agent_timeouts


def test_x402_off_keeps_the_old_waits():
    assert agent_timeouts.resolver_wait_seconds(False) == 4
    assert agent_timeouts.scorer_wait_seconds(False) == 10


def test_x402_on_waits_longer():
    assert agent_timeouts.resolver_wait_seconds(True) == 7
    assert agent_timeouts.scorer_wait_seconds(True) == 15


def test_pocket_pilot_outwaits_card_scorer():
    """Pocket Pilot must wait longer than Card Scorer waits for the Resolver,
    or a paid lookup would always look like a timeout from the front door."""
    for on in (False, True):
        assert agent_timeouts.scorer_wait_seconds(on) > agent_timeouts.resolver_wait_seconds(on)


def test_agents_use_the_x402_off_values_in_tests():
    # conftest sets X402_ENABLED=off
    import card_scorer_agent
    import pocket_pilot_agent
    assert card_scorer_agent.RESOLVER_TIMEOUT_SECONDS == 4
    assert pocket_pilot_agent.SCORE_READ_TIMEOUT_SECONDS == 10
