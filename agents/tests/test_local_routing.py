"""LOCAL_AGENT_ROUTING: our four agents find each other at 127.0.0.1, and
anything else (ASI:One users) still resolves the normal way."""
import asyncio

import pytest
from uagents import Agent
from uagents.resolver import Resolver
from uagents_core.identity import Identity

import local_routing


def run(coro):
    return asyncio.run(coro)


def addr(seed_var):
    # conftest.py sets each seed to f"test-{name.lower()}"
    return Identity.from_seed(f"test-{seed_var.lower()}", 0).address


@pytest.fixture
def event_loop_for_agents():
    """uagents.Agent() calls asyncio.get_event_loop(); asyncio.run() in
    earlier tests leaves no current loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield
    asyncio.set_event_loop(None)
    loop.close()


class FakeFallback(Resolver):
    def __init__(self):
        self.asked = []

    async def resolve(self, destination):
        self.asked.append(destination)
        return destination, ["https://agentverse.ai/v1/submit"]


def test_on_by_default(monkeypatch):
    monkeypatch.delenv("LOCAL_AGENT_ROUTING", raising=False)
    assert local_routing.enabled()


def test_can_be_turned_off(monkeypatch):
    monkeypatch.setenv("LOCAL_AGENT_ROUTING", "off")
    assert not local_routing.enabled()
    assert local_routing.build_resolver() is None  # uagents' default GlobalResolver


def test_directory_maps_all_four_seeds_to_local_ports(monkeypatch):
    monkeypatch.setenv("CARD_SCORER_PORT", "9102")
    monkeypatch.delenv("POCKET_PILOT_PORT", raising=False)
    monkeypatch.delenv("AGENT_PORT", raising=False)
    d = local_routing.directory()
    assert d[addr("CARD_SCORER_SEED")] == "http://127.0.0.1:9102/submit"
    assert d[addr("POCKET_PILOT_SEED")] == "http://127.0.0.1:8001/submit"
    assert d[addr("PAYMENT_PLANNER_SEED")] == "http://127.0.0.1:8003/submit"
    assert d[addr("MERCHANT_RESOLVER_SEED")] == "http://127.0.0.1:8004/submit"


def test_own_agents_resolve_locally_without_the_almanac():
    fallback = FakeFallback()
    planner = addr("PAYMENT_PLANNER_SEED")
    resolver = local_routing.LocalFirstResolver({planner: "http://127.0.0.1:8003/submit"}, fallback)
    assert run(resolver.resolve(planner)) == (planner, ["http://127.0.0.1:8003/submit"])
    assert run(resolver.resolve(f"agent://{planner}")) == (planner, ["http://127.0.0.1:8003/submit"])
    assert fallback.asked == []


def test_other_addresses_still_use_the_normal_resolver():
    """ASI:One users aren't ours: Pocket Pilot's replies to them must still
    go through the Almanac / mailbox."""
    fallback = FakeFallback()
    resolver = local_routing.LocalFirstResolver({}, fallback)
    asi_user = Identity.from_seed("some-asi-one-user", 0).address
    assert run(resolver.resolve(asi_user)) == (asi_user, ["https://agentverse.ai/v1/submit"])
    assert fallback.asked == [asi_user]


class _Status:
    def __init__(self, endpoint="", detail=""):
        self.endpoint, self.detail = endpoint, detail


def test_route_labels():
    assert local_routing.route(_Status("http://127.0.0.1:8003/submit")) == \
        "local (http://127.0.0.1:8003/submit)"
    assert local_routing.route(_Status("https://agentverse.ai/v1/submit")).startswith("mailbox/remote")
    assert local_routing.route(_Status("", "Unable to resolve destination endpoint")) == \
        "not delivered (Unable to resolve destination endpoint)"
    assert local_routing.route(None) == "not delivered (no reply)"


def test_keep_local_server_registers_a_rest_route_only_when_on(monkeypatch, event_loop_for_agents):
    """Our own REST route keeps the local server (and /submit) up even
    without the inspector's routes."""
    monkeypatch.setenv("LOCAL_AGENT_ROUTING", "on")
    on = Agent(name="t-on", seed="local-routing-test-on", port=18999, mailbox=True)
    local_routing.keep_local_server(on, "t-on")
    assert ("GET", "/health") in on._rest_handlers

    monkeypatch.setenv("LOCAL_AGENT_ROUTING", "off")
    off = Agent(name="t-off", seed="local-routing-test-off", port=18998, mailbox=True)
    local_routing.keep_local_server(off, "t-off")
    assert ("GET", "/health") not in off._rest_handlers


def test_every_agent_is_built_with_the_local_resolver(event_loop_for_agents):
    import card_scorer_agent
    import merchant_resolver_agent
    import payment_planner_agent
    import pocket_pilot_agent

    for module in (card_scorer_agent, merchant_resolver_agent, payment_planner_agent, pocket_pilot_agent):
        assert isinstance(module.agent._resolver, local_routing.LocalFirstResolver), module.__name__
        assert module.agent._use_mailbox, module.__name__  # still on Agentverse
