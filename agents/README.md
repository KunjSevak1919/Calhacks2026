# Pocket Pilot agents (Fetch.ai uAgents)

A team of four uAgents. **Pocket Pilot is the only one users ever talk to**
(Agent Chat Protocol, so it's discoverable and usable from ASI:One). It
delegates the real work to three specialists over agent-to-agent messages --
and Card Scorer itself delegates one hop further, to Merchant Resolver,
before it scores anything:

```
                      ASI:One / chat / REST
                              |
                              v
                     +------------------+
                     |   Pocket Pilot   |   chat protocol, intent parsing,
                     |   (front door)   |   per-sender pending-confirmation
                     +------------------+   store, coach, help, demo reset
                     /         |          \
       ScoreRequest /          | DueSoonRequest      \ ResolveRequest
      /ScoreResponse          | / ExecuteActionRequest \ /ResolveResponse
                   /           | / PayRequest /          \   (direct, for
                  v            |   ImpactRequest           v  "what kind of
        +----------------+     v   (+Response)    +--------------------+
        |  Card Scorer   |  +--------------------+ | Merchant Resolver  |
        | (which card?)  |  |  Payment Planner   | | (what kind of      |
        |                |  | (money & state:    | |  store is this?)   |
        |                |  |  due dates, approve/| +--------------------+
        |                |  |  dismiss, pay,      |          ^
        +----------------+  |  impact)            |          |
              |  \          +--------------------+           |
   ResolveRequest\                                            |
   /ResolveResponse\___________ (same agent, same message ____|
              |                  type Pocket Pilot uses directly above)
              v
      server/ Flask API (the real engine --
      scorer.py / planner.py / resolver.py)
```

Card Scorer asks Merchant Resolver "what kind of store is this?" before
every pick (4s timeout); Pocket Pilot also asks Merchant Resolver directly
for "what kind of store is X?" chat questions, independent of scoring a
purchase. If any specialist doesn't answer in time (process down, mailbox
not yet connected, network hiccup), the caller falls back to calling the
Flask API directly and still answers -- the user never sees a hang. Every
reply comes from one of these paths; no agent does its own money math, and
there's no LLM anywhere in the resolve/score path.

## Files

- `pocket_pilot_agent.py` -- the front door: chat protocol, REST handlers,
  mailbox, and `SpecialistDelegate` (tries a specialist, falls back on
  timeout).
- `card_scorer_agent.py` -- specialist: asks Merchant Resolver what kind of
  store this is, then picks the best card for a purchase by calling
  `/api/pick`. Its protocol is published so any other agent on Agentverse
  can call it too (the hook for a future Coinbase x402 paid endpoint -- not
  built here). Its confidence-threshold decision (trust the Resolver's mcc,
  or play it safe with the merchant name only) lives in `card_scorer.py`.
- `payment_planner_agent.py` -- specialist: owns everything that changes
  money or state -- due-soon notifications, approve/dismiss, pay, impact.
- `merchant_resolver_agent.py` -- specialist: turns a store name into a
  merchant category code (MCC), category, and confidence. A thin uagents
  wrapper around `merchant_resolver.py`, which is a read-only wrapper around
  the deterministic resolver already in `server/pocketpilot/resolver.py`
  (same file your teammate owns -- no copy, no edits). No LLM.
- `card_scorer.py` / `merchant_resolver.py` -- pure logic with no uagents
  import, so they're unit-testable without a live agent runtime (same split
  as `dispatch.py`/`pocket_pilot_agent.py`).
- `messages.py` -- shared `uagents.Model` request/response classes, every
  one carrying a `request_id` for correlated logging.
- `dispatch.py` -- pure chat/intent routing logic (no uagents import), so
  it's unit-testable without a live agent runtime. Talks to a "delegate"
  (an object with async `score_pick`/`due_soon`/`execute_action`/`pay`/
  `impact`/`resolve_merchant` methods) instead of the Flask API directly --
  `DirectDelegate` (the default) calls Flask directly; `SpecialistDelegate`
  (in `pocket_pilot_agent.py`) tries the specialist agents first.
- `intents.py` -- `parse_intent(text) -> dict`, deterministic first, with an
  optional LLM fallback behind `parse_intent_llm`.
- `api_client.py` -- `requests` wrapper around the Flask API with timeouts
  and clear errors. Shared by all four agents.
- `run_all.py` -- starts all four agents as subprocesses with one command.
- `tests/` -- pytest, Flask API mocked and specialists faked via the
  delegate interface.

## Setup

```bash
cd agents
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Add to the repo's `.env` (see `.env.example`):

```
POCKET_PILOT_API_URL=http://localhost:5001
POCKET_PILOT_SEED=some-long-random-string
POCKET_PILOT_PORT=8001
CARD_SCORER_SEED=another-long-random-string
CARD_SCORER_PORT=8002
PAYMENT_PLANNER_SEED=yet-another-long-random-string
PAYMENT_PLANNER_PORT=8003
MERCHANT_RESOLVER_SEED=one-more-long-random-string
MERCHANT_RESOLVER_PORT=8004
# ANTHROPIC_API_KEY=...                    # optional, only for intent-parsing fallback
```

Seeds deterministically derive each agent's address (`Identity.from_seed(seed, 0)`,
confirmed from uagents' own `Agent.__init__`), so Pocket Pilot and Card
Scorer compute specialist addresses from their seeds at startup -- no
separate address variables to keep in sync, and nothing to copy-paste after
a restart.

## Run

```bash
# terminal 1
cd server && python app.py          # http://localhost:5001

# terminal 2 -- all four agents with one command
cd agents && python run_all.py
```

Or run each separately in its own terminal if you want to watch one agent's
log in isolation: `python merchant_resolver_agent.py`,
`python card_scorer_agent.py`, `python payment_planner_agent.py`,
`python pocket_pilot_agent.py`. Each prints its own address and Agentverse
inspector link on startup.

### Test it

```bash
pytest                              # agents/tests, Flask API mocked, specialists faked

# REST against Pocket Pilot (PowerShell)
Invoke-RestMethod -Method Post http://localhost:8001/pick -Body '{"merchant":"Costco","amount":42}' -ContentType 'application/json'

# REST (bash) -- this exercises the real chain: Pocket Pilot -> Card Scorer
# -> Merchant Resolver -> back, not just dispatch.py's unit tests
curl -X POST http://localhost:8001/pick -H 'Content-Type: application/json' \
  -d '{"merchant":"Costco","amount":42}'

curl http://localhost:8001/health   # also reports all three specialists' addresses
```

## Register all four on Agentverse

Each agent needs this done once (repeat for Pocket Pilot, Card Scorer,
Payment Planner, and Merchant Resolver):

1. With the agent running, open the **Inspector** link it printed.
2. Click **Connect** in the Agent Inspector UI.
3. Choose **Mailbox** (the other options are Proxy and Custom).
4. The terminal log switches from "Agent mailbox not found: create one using
   the agent inspector" to normal operation -- no separate API key step
   needed for a local dev agent.
5. Go to [Agentverse](https://agentverse.ai) -> **My Agents**. All four
   show up tagged **Mailbox**.

**Only Pocket Pilot needs this for users to find it in ASI:One.** The three
specialists also register so each is independently discoverable/callable by
other Agentverse agents (per the challenge spec), but nobody chats with them
directly -- and until Merchant Resolver's mailbox is connected, Card
Scorer's own call to it will time out and fall back gracefully (see the
judge script below for exactly what that looks like in the logs).

## Descriptions + keywords for each agent's profile

Per Agentverse's [agent discovery setup guide](https://docs.agentverse.ai/documentation/agent-discovery/setup-guide),
ASI:One ranks agents on: Agent Chat Protocol enabled, a README, an avatar,
and a few real interactions logged. Set these on each agent's **Profile**
and **README/About** tab:

**Pocket Pilot** (the one users find in ASI:One):
> Pocket Pilot picks the best credit card for a purchase, flips Debt Guard
> on when you're carrying a balance, reminds you about due dates and
> subscriptions before they cost you, and explains credit in plain words --
> built for college students with more than one card. Every action it
> takes needs your "yes" first.

Keywords: `credit card`, `which card`, `students`, `debt`, `due dates`,
`rewards`, `personal finance`, `debt guard`.

**Card Scorer** (discoverable by other agents, not meant for chat):
> Scores a student's credit cards for a given purchase (merchant + amount)
> and returns the best card, why, and the runner-up, using real
> rewards-vs-interest math -- no LLM in the scoring path. Callable by any
> agent that needs a card recommendation.

Keywords: `card scoring`, `rewards`, `cashback`, `merchant category`,
`credit card recommendation`.

**Payment Planner** (discoverable, not meant for chat):
> Tracks a student's due dates, subscriptions, and annual fees, and
> executes approve/pay/dismiss actions -- but only when explicitly told to
> by a trusted front-door agent on behalf of a user who said "yes."

Keywords: `due dates`, `bill reminders`, `subscriptions`, `payments`,
`personal finance automation`.

**Merchant Resolver** (discoverable, not meant for chat):
> Turns a store name into a merchant category code (MCC), category, and
> confidence for card rewards -- deterministic, no LLM. Flags low-confidence
> guesses for a future paid lookup instead of guessing silently. Callable by
> any agent that needs to know what kind of store a purchase is at.

Keywords: `merchant category code`, `MCC`, `store category`, `merchant
resolution`, `rewards categories`.

Send each agent a handful of test messages from its **Testing** dashboard
(~10 interactions, per the setup guide) so it has activity before judges
search for it.

## Chat with it in ASI:One

Open [asi1.ai](https://asi1.ai), search "Pocket Pilot" or one of its
keywords, and start a conversation.

### Example prompts

- "Which card should I use at Whole Foods for $84.50?"
- "What kind of store is Costco?"
- "I'm carrying a balance" / "turn on debt guard"
- "Anything due soon?"
- "yes" / "no" (only right after the agent asks)
- "I paid at Whole Foods $84.50 with Zero Intro"
- "How much have you saved me?"
- "Why did my score drop?"
- "reset demo"
- "help"

## Known gap: 4 endpoints not on this server branch yet

`server/app.py` on this branch doesn't have `/api/pay`, `/api/impact`,
`/api/log`, or `/api/demo/reset`. The `pay`, `impact`, and `reset demo`
intents are fully wired through Payment Planner and `api_client.py` --
they'll just reply "isn't available on this server yet" until those routes
exist in `server/`. No agent code needs to change when they land.

## 60-second "behind the scenes" script for judges

1. **What's running** (point at the four terminal logs, or one shared one
   from `run_all.py`): "Pocket Pilot is the only agent a user talks to --
   it's on Agent Chat Protocol, registered on Agentverse, usable from
   ASI:One. Behind it are three specialists: Card Scorer answers 'which
   card', Payment Planner owns everything that touches money or state, and
   Merchant Resolver turns a store name into a category -- and Card Scorer
   calls Merchant Resolver itself before it ever scores a card."
2. **Show the two-hop chain** -- ask Pocket Pilot "Which card should I use
   at Costco for $42?" (chat, or `curl .../pick`). Point at the log lines in
   order: `[card-scorer]: asking resolver: 'Costco'`, then
   `[merchant-resolver]: Costco -> warehouse_club 5300 (0.90, known_merchant)`,
   then `[pocket-pilot]: Card Scorer answered via agent message`. Say:
   "That's three agents and two real network hops for one answer, not a
   function call."
3. **Show the safety net** -- kill the Merchant Resolver process (Ctrl+C its
   terminal, or `Stop-Process`). Ask the same question again. It still
   answers correctly -- Card Scorer logs `resolver unreachable/timed out,
   letting the server resolve 'Costco' itself`, and the server's own
   resolver still gets the category right. Say: "Judges can kill any
   specialist mid-demo and it still works. The user never sees a hang, and
   every number still comes from the real engine either way, never invented
   by an LLM."
4. **Show the approval gate** -- ask "anything due soon?", then "yes".
   Point at Payment Planner's log line showing it executed the exact
   `note_id` Pocket Pilot forwarded, for the exact sender who said yes.
   Say: "No agent moves money or changes settings without that explicit
   yes, and it only works for the person who was actually asked."

## Demo script (full flow)

1. **Link**: start Flask (`server/app.py`), start all four agents
   (`python run_all.py`), open each Inspector link, click Connect -> Mailbox.
2. **Pick**: send `Which card should I use at Whole Foods for $84.50?` ->
   best card, one-line reason, runner-up.
3. **Store category**: send `What kind of store is Costco?` -> "Costco:
   Warehouse club, not grocery."
4. **Debt Guard flip**: send `I'm carrying a balance` -> "Debt Guard is on.
   Use <card> instead. <other card> would earn $X, but its Y% APR would
   cost $Z over 3 months."
5. **Due soon**: send `Anything due soon?` -> top alert summarized, ending
   with the exact action: "Reply yes to schedule $640 to Aurum Gold on
   Oct 29."
6. **Yes**: send `yes` -> "Done. Scheduled $640 to Aurum Gold on Oct 29."
   then offers the next alert the same way.
7. **Impact**: send `How much have you saved me?` -> replies with the
   impact number once `/api/impact` exists on `server/`; today it replies
   that the endpoint isn't available yet.
