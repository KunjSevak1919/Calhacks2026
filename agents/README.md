# Pocket Pilot agents (Fetch.ai uAgents)

A team of three uAgents. **Pocket Pilot is the only one users ever talk to**
(Agent Chat Protocol, so it's discoverable and usable from ASI:One). It
delegates the real work to two specialists over agent-to-agent messages:

```
                      ASI:One / chat / REST
                              |
                              v
                     +------------------+
                     |   Pocket Pilot   |   chat protocol, intent parsing,
                     |   (front door)   |   per-sender pending-confirmation
                     +------------------+   store, coach, help, demo reset
                        |            |
          ScoreRequest  |            |  DueSoonRequest / ExecuteActionRequest
         /ScoreResponse |            |  / PayRequest / ImpactRequest (+Response)
                        v            v
              +----------------+  +--------------------+
              |  Card Scorer   |  |  Payment Planner   |
              | (which card?)  |  | (money & state:    |
              |                |  |  due dates, approve/|
              |                |  |  dismiss, pay,      |
              |                |  |  impact)            |
              +----------------+  +--------------------+
                        \            /
                         v          v
                     server/ Flask API (the real engine --
                     scorer.py / planner.py / resolver.py)
```

If a specialist doesn't answer within 5 seconds (process down, mailbox not
yet connected, network hiccup), Pocket Pilot falls back to calling the Flask
API directly and still answers -- the user never sees a hang. Every reply
comes from one of these two paths; no agent does its own money math.

## Files

- `pocket_pilot_agent.py` -- the front door: chat protocol, REST handlers,
  mailbox, and `SpecialistDelegate` (tries a specialist, falls back on
  timeout).
- `card_scorer_agent.py` -- specialist: picks the best card for a purchase by
  calling `/api/pick`. Its protocol is published so any other agent on
  Agentverse can call it too (the hook for a future Coinbase x402 paid
  endpoint -- not built here).
- `payment_planner_agent.py` -- specialist: owns everything that changes
  money or state -- due-soon notifications, approve/dismiss, pay, impact.
- `messages.py` -- shared `uagents.Model` request/response classes, every
  one carrying a `request_id` for correlated logging.
- `dispatch.py` -- pure chat/intent routing logic (no uagents import), so
  it's unit-testable without a live agent runtime. Talks to a "delegate"
  (an object with async `score_pick`/`due_soon`/`execute_action`/`pay`/
  `impact` methods) instead of the Flask API directly -- `DirectDelegate`
  (the default) calls Flask directly; `SpecialistDelegate` (in
  `pocket_pilot_agent.py`) tries the specialist agents first.
- `intents.py` -- `parse_intent(text) -> dict`, deterministic first, with an
  optional LLM fallback behind `parse_intent_llm`.
- `api_client.py` -- `requests` wrapper around the Flask API with timeouts
  and clear errors. Shared by all three agents.
- `run_all.py` -- starts all three agents as subprocesses with one command.
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
# ANTHROPIC_API_KEY=...                    # optional, only for intent-parsing fallback
```

Seeds deterministically derive each agent's address (`Identity.from_seed(seed, 0)`,
confirmed from uagents' own `Agent.__init__`), so Pocket Pilot computes the
specialists' addresses from their seeds at startup -- no separate address
variables to keep in sync, and nothing to copy-paste after a restart.

## Run

```bash
# terminal 1
cd server && python app.py          # http://localhost:5001

# terminal 2 -- all three agents with one command
cd agents && python run_all.py
```

Or run each separately in its own terminal if you want to watch one agent's
log in isolation: `python card_scorer_agent.py`, `python payment_planner_agent.py`,
`python pocket_pilot_agent.py`. Each prints its own address and Agentverse
inspector link on startup.

### Test it

```bash
pytest                              # agents/tests, Flask API mocked, specialists faked

# REST against Pocket Pilot (PowerShell)
Invoke-RestMethod -Method Post http://localhost:8001/pick -Body '{"merchant":"Whole Foods","amount":84.5}' -ContentType 'application/json'

# REST (bash) -- this exercises the real Pocket Pilot -> Card Scorer agent
# message, not just dispatch.py's unit tests
curl -X POST http://localhost:8001/pick -H 'Content-Type: application/json' \
  -d '{"merchant":"Whole Foods","amount":84.5}'

curl http://localhost:8001/health   # also reports both specialists' addresses
```

## Register all three on Agentverse

Each agent needs this done once (repeat for Pocket Pilot, Card Scorer, and
Payment Planner):

1. With the agent running, open the **Inspector** link it printed.
2. Click **Connect** in the Agent Inspector UI.
3. Choose **Mailbox** (the other options are Proxy and Custom).
4. The terminal log switches from "Agent mailbox not found: create one using
   the agent inspector" to normal operation -- no separate API key step
   needed for a local dev agent.
5. Go to [Agentverse](https://agentverse.ai) -> **My Agents**. All three
   show up tagged **Mailbox**.

**Only Pocket Pilot needs this for users to find it in ASI:One.** Card
Scorer and Payment Planner also register so Card Scorer is independently
discoverable/callable by other Agentverse agents (per the challenge spec),
but nobody chats with them directly.

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

Send each agent a handful of test messages from its **Testing** dashboard
(~10 interactions, per the setup guide) so it has activity before judges
search for it.

## Chat with it in ASI:One

Open [asi1.ai](https://asi1.ai), search "Pocket Pilot" or one of its
keywords, and start a conversation.

### Example prompts

- "Which card should I use at Whole Foods for $84.50?"
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

1. **What's running** (point at the three terminal logs, or one shared one
   from `run_all.py`): "Pocket Pilot is the only agent a user talks to --
   it's on Agent Chat Protocol, registered on Agentverse, usable from
   ASI:One. Behind it are two specialists it delegates to over agent-to-agent
   messages: Card Scorer, which just answers 'which card', and Payment
   Planner, which owns everything that touches money or state."
2. **Show a pick happening** -- ask Pocket Pilot "Which card should I use at
   Whole Foods for $84.50?" (chat, or `curl .../pick`). Point at the log
   line `[req-id] Card Scorer answered via agent message` -- that's a real
   agent-to-agent round trip, not a function call.
3. **Show the safety net** -- kill the Card Scorer process (Ctrl+C its
   terminal, or `Stop-Process`). Ask the same question again. It still
   answers correctly. Point at the log lines: `ERROR: [dispenser]: Failed to
   deliver message to agent1q...` immediately followed by
   `WARNING: [pocket-pilot]: [req-id] Card Scorer unreachable/timed out,
   falling back to direct API`. Say: "Judges can kill any specialist mid-demo
   and it still works -- Pocket Pilot calls the Flask API directly instead.
   The user never sees a hang, and every number still comes from the real
   engine either way, never invented by an LLM."
4. **Show the approval gate** -- ask "anything due soon?", then "yes".
   Point at Payment Planner's log line showing it executed the exact
   `note_id` Pocket Pilot forwarded, for the exact sender who said yes.
   Say: "No agent moves money or changes settings without that explicit
   yes, and it only works for the person who was actually asked."

## Demo script (full flow)

1. **Link**: start Flask (`server/app.py`), start all three agents
   (`python run_all.py`), open each Inspector link, click Connect -> Mailbox.
2. **Pick**: send `Which card should I use at Whole Foods for $84.50?` ->
   best card, one-line reason, runner-up.
3. **Debt Guard flip**: send `I'm carrying a balance` -> Debt Guard turns on,
   re-answers the same purchase: "Same purchase, new pick: ...".
4. **Due soon**: send `Anything due soon?` -> top alert summarized, asks
   "Want me to take care of it? (yes/no)".
5. **Yes**: send `yes` -> Payment Planner executes it, confirms what it did.
6. **Impact**: send `How much have you saved me?` -> replies with the
   impact number once `/api/impact` exists on `server/`; today it replies
   that the endpoint isn't available yet.
