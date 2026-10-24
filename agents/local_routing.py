"""Local routing between our own four agents (LOCAL_AGENT_ROUTING=on, the
default). All four run on one machine, so a hop between them doesn't need
the Almanac API, which times out on slow Wi-Fi (uagents' AlmanacApiResolver
retries 10 times at 1s each, then "Unable to resolve destination endpoint").

How, per uagents 0.26.1's own source:
- Agent(resolve=...) takes any Resolver (resolver.py); without it the agent
  builds GlobalResolver(), which asks the Almanac API. LocalFirstResolver
  answers our own four addresses with http://127.0.0.1:<port>/submit and
  hands every other address (ASI:One users, anyone else) to GlobalResolver,
  exactly as before.
- Every agent's ASGI server accepts signed envelopes at /submit on its own
  port (asgi.py), mailbox or not. Agent.run_async only drops that server
  for a mailbox agent with no REST routes; the inspector's routes (on by
  default) already count, and each specialist also adds GET /health so it
  doesn't depend on the inspector. Their mailboxes stay, so they stay
  registered and discoverable on Agentverse.
- Replies need it too: a specialist answers with ctx.send(sender, ...),
  which resolves the sender, so every agent gets the same resolver.
"""
import os

from uagents import Model
from uagents.resolver import GlobalResolver, Resolver
from uagents_core.identity import Identity, parse_identifier

from seeds import require_seed

LOCAL_HOST = "127.0.0.1"

# name -> (seed env var, port env var, default port). Ports match each agent file.
AGENTS = {
    "pocket-pilot": ("POCKET_PILOT_SEED", "POCKET_PILOT_PORT", 8001),
    "card-scorer": ("CARD_SCORER_SEED", "CARD_SCORER_PORT", 8002),
    "payment-planner": ("PAYMENT_PLANNER_SEED", "PAYMENT_PLANNER_PORT", 8003),
    "merchant-resolver": ("MERCHANT_RESOLVER_SEED", "MERCHANT_RESOLVER_PORT", 8004),
}


def enabled():
    return os.getenv("LOCAL_AGENT_ROUTING", "on").strip().lower() != "off"


def port(name):
    _seed, port_var, default = AGENTS[name]
    if name == "pocket-pilot":
        return int(os.getenv(port_var, os.getenv("AGENT_PORT", str(default))))
    return int(os.getenv(port_var, str(default)))


def local_endpoint(name):
    return f"http://{LOCAL_HOST}:{port(name)}/submit"


def directory():
    """address -> local /submit endpoint, for all four agents."""
    return {Identity.from_seed(require_seed(seed_var), 0).address: local_endpoint(name)
            for name, (seed_var, _p, _d) in AGENTS.items()}


class LocalFirstResolver(Resolver):
    def __init__(self, local, fallback=None):
        self._local = dict(local)
        self._fallback = fallback or GlobalResolver()

    async def resolve(self, destination):
        _prefix, _name, address = parse_identifier(destination)
        if address in self._local:
            return address, [self._local[address]]
        return await self._fallback.resolve(destination)


def build_resolver():
    """The resolver to pass as Agent(resolve=...), or None for uagents'
    default (Almanac API for everything) when LOCAL_AGENT_ROUTING=off."""
    return LocalFirstResolver(directory()) if enabled() else None


def route(status):
    """Which route a send took, from the MsgStatus uagents returns."""
    endpoint = getattr(status, "endpoint", "") or ""
    if endpoint.startswith(f"http://{LOCAL_HOST}:"):
        return f"local ({endpoint})"
    if endpoint:
        return f"mailbox/remote ({endpoint})"
    detail = getattr(status, "detail", "") or "no reply"
    return f"not delivered ({detail})"


class LocalHealth(Model):
    ok: bool
    agent: str
    address: str
    local_routing: bool


def keep_local_server(agent, name):
    """GET /health on the agent's local port: a quick "is it up" check, and
    a REST route of our own so uagents keeps the local server (and /submit)
    running even if the inspector is ever turned off."""
    if not enabled():
        return

    @agent.on_rest_get("/health", LocalHealth)
    async def _local_health(ctx):
        return LocalHealth(ok=True, agent=name, address=agent.address, local_routing=True)


async def reply(ctx, sender, message):
    """ctx.send, logging which route the reply took."""
    status = await ctx.send(sender, message)
    ctx.logger.info(f"[{getattr(message, 'request_id', '-')}] {type(message).__name__} -> "
                    f"{sender[:18]}... via {route(status)}")
    return status


def describe():
    """One startup line saying how this agent reaches the other three."""
    if not enabled():
        return "Local agent routing: off (every hop resolves through the Almanac API / mailbox)"
    hops = ", ".join(f"{name} -> {local_endpoint(name)}" for name in AGENTS)
    return f"Local agent routing: on ({hops})"
