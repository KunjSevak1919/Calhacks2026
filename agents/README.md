# Pocket Pilot agent (Fetch.ai uAgents)

A single uAgent that puts Pocket Pilot's Flask API (`server/`) into chat: it
implements the [Agent Chat Protocol](https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol)
so it's discoverable and usable from ASI:One, registers on Agentverse via a
mailbox, and also exposes plain REST endpoints for the app or other agents to
call directly.

No money math happens in this agent -- every number it says comes straight
from the Flask API in `server/`.

## Files

- `pocket_pilot_agent.py` -- the agent: chat protocol, REST handlers, mailbox.
- `dispatch.py` -- pure chat/intent routing logic (no uagents import), so it's
  unit-testable without a live agent runtime.
- `intents.py` -- `parse_intent(text) -> dict`, deterministic first, with an
  optional LLM fallback behind `parse_intent_llm`.
- `api_client.py` -- `requests` wrapper around the Flask API with timeouts and
  clear errors.
- `tests/` -- pytest, Flask API mocked.

## Setup

```bash
cd agents
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Add to the repo's `.env` (see `.env.example`):

```
AGENT_SEED=some-long-random-string         # keeps the agent's address stable
POCKET_PILOT_API_URL=http://localhost:5001
AGENT_PORT=8001
# ANTHROPIC_API_KEY=...                    # optional, only for intent-parsing fallback
```

## Run

```bash
# terminal 1
cd server && python app.py          # http://localhost:5001

# terminal 2
cd agents && python pocket_pilot_agent.py
```

On startup the agent prints its address and an Agentverse inspector link, e.g.:

```
Pocket Pilot agent address: agent1q24ah...
Inspector: https://agentverse.ai/inspect/?uri=http%3A%2F%2F127.0.0.1%3A8001&address=agent1q24ah...
```

### Test it

```bash
pytest                              # agents/tests, Flask API mocked

# REST (PowerShell)
Invoke-RestMethod -Method Post http://localhost:8001/pick -Body '{"merchant":"Whole Foods","amount":84.5}' -ContentType 'application/json'

# REST (bash)
curl -X POST http://localhost:8001/pick -H 'Content-Type: application/json' \
  -d '{"merchant":"Whole Foods","amount":84.5}'

curl http://localhost:8001/health
```

## Connect the mailbox on Agentverse

1. With the agent running, open the **Inspector** link it printed.
2. Click **Connect** in the Agent Inspector UI.
3. Choose **Mailbox** (the other options are Proxy and Custom).
4. That's it -- the agent registers itself automatically; the terminal log
   shows "Agent mailbox not found: create one using the agent inspector"
   until you do this, then switches to normal operation. No separate API key
   step is needed for a local dev agent.
5. Go to [Agentverse](https://agentverse.ai) -> **My Agents**. The agent shows
   up tagged **Mailbox**.

## Make it discoverable in ASI:One

Per Agentverse's [agent discovery setup guide](https://docs.agentverse.ai/documentation/agent-discovery/setup-guide),
ASI:One ranks agents on: Agent Chat Protocol enabled (done, via `chat_proto`
in this file), a README, an avatar, and a few real interactions logged.

On the agent's Agentverse page:
1. **Profile** tab -- set a short description and upload an avatar.
2. **README/About** -- the text ASI:One uses to understand what the agent
   does. Use something like:

   > Pocket Pilot picks the best credit card for a purchase, flips Debt Guard
   > on when you're carrying a balance, reminds you about due dates and
   > subscriptions before they cost you, and explains credit in plain words --
   > built for college students with more than one card. Every action it
   > takes needs your "yes" first.

3. **Keywords/tags** -- add: `credit card`, `which card`, `students`,
   `debt`, `due dates`, `rewards`, `personal finance`, `debt guard`.
4. Send it a handful of test messages from the **Testing** dashboard (the
   setup guide recommends ~10 interactions) so it has activity before judges
   search for it.

## Chat with it in ASI:One

Open [asi1.ai](https://asi1.ai) (or ASI:One chat), search for "Pocket Pilot"
or one of the keywords above, and start a conversation -- or message the
agent's address directly from any other uAgent/ASI:One session.

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
intents are fully wired on the agent side (`api_client.py`, `dispatch.py`) --
they'll just reply "`/api/pay isn't available on this server yet.`" (etc.)
until those routes exist in `server/`. No agent code needs to change when
they land.

## Demo script

1. **Link**: start Flask (`server/app.py`), start the agent, open its
   Inspector link, click Connect -> Mailbox.
2. **Pick**: in ASI:One chat, send `Which card should I use at Whole Foods
   for $84.50?` -> agent replies with the best card, a one-line reason, and
   the runner-up (e.g. *"Aurum Gold earns 4% on grocery, $3.38 back... Runner-up: Steady 2%."*).
3. **Debt Guard flip**: send `I'm carrying a balance` -> agent turns Debt
   Guard on and re-answers the same purchase: *"Debt Guard is now on. Same
   purchase, new pick: ..."*.
4. **Due soon**: send `Anything due soon?` -> agent summarizes the top
   alert and asks *"Want me to take care of it? (yes/no)"*.
5. **Yes**: send `yes` -> agent calls the approve endpoint and confirms what
   it did, e.g. *"Scheduled $50 to Card1 on Nov 3."*
6. **Impact**: send `How much have you saved me?` -> replies with the
   impact number once `/api/impact` exists on `server/`; today it replies
   that the endpoint isn't available yet.
