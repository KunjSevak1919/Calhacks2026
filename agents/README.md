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
                     |   (front door)   |   per-chat pending-confirmation
                     +------------------+   store, wallet, Visa, coach, help
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
  can call it too; the same answer is sold over Coinbase x402 by
  `x402_server.py` (see "Coinbase x402" below). Its confidence-threshold decision (trust the Resolver's mcc,
  or play it safe with the merchant name only) lives in `card_scorer.py`.
- `payment_planner_agent.py` -- specialist: owns everything that changes
  money or state -- due-soon notifications, approve/dismiss, pay, impact.
  Writes (`ExecuteActionRequest`, `PayRequest`) are accepted only from
  Pocket Pilot's own address (derived from `POCKET_PILOT_SEED`); anyone
  else gets `ok=False, error="unauthorized"`. Reads stay open.
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
- `card_replies.py` -- pure formatters for the wallet, one card, payback
  plans, annual fee checks and impact, plus `find_card()` (case-insensitive,
  partial card names). Every number comes from the server; missing values
  show as "—".
- `seeds.py` -- `require_seed()`: agents refuse to start without their seed.
- `intents.py` -- `parse_intent(text) -> dict`, deterministic first, with an
  optional LLM fallback behind `parse_intent_llm`. Strips ASI:One's
  `@agent1...` mention and turns curly quotes into straight ones first.
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
DEMO_MODE=off        # "on" lets "reset demo" work in chat
FLASK_DEBUG=0        # server/: 1 turns on debug + auto-reloader (a reload wipes state)
# ANTHROPIC_API_KEY=...                    # optional, only for intent-parsing fallback
```

**All four seeds are required.** There are no built-in defaults: each agent
(and `run_all.py`, which checks all four first) refuses to start without
its own seed. Seeds deterministically derive each agent's address
(`Identity.from_seed(seed, 0)`, confirmed from uagents' own
`Agent.__init__`), so Pocket Pilot and Card Scorer compute specialist
addresses from their seeds at startup, and Payment Planner computes Pocket
Pilot's address to know which sender may ask for writes. No separate
address variables to keep in sync.

## Local routing between our own agents (`LOCAL_AGENT_ROUTING=on`, default)

On slow venue Wi-Fi, Agentverse lookups time out (uagents' Almanac API
resolver retries 10 times at 1s each: "Almanac API lookup ... TimeoutError",
"Unable to resolve destination endpoint"), and every hop between our agents
fell back to the direct API. All four agents run on one machine, so with
`LOCAL_AGENT_ROUTING=on` they reach each other directly:

- Every agent is built with `resolve=LocalFirstResolver(...)`
  (`local_routing.py`, a `uagents.resolver.Resolver`). Our four addresses
  come from the seeds and the `*_PORT` vars, and resolve to
  `http://127.0.0.1:<port>/submit`. Any other address (ASI:One users)
  goes to uagents' normal `GlobalResolver`, unchanged.
- Every agent keeps `mailbox=True`. Pocket Pilot's mailbox is how ASI:One
  reaches it, and the specialists' mailboxes keep them registered and
  discoverable on Agentverse. A mailbox agent still serves `/submit` on
  its own port (uagents keeps the local server whenever the agent has REST
  routes; the inspector's count, and each specialist adds `GET /health`).
- Replies are local too, since every agent uses the same resolver.
- Each agent needs all four seeds in `.env` (to know the others'
  addresses). `run_all.py` already checks this.
- Fallbacks are unchanged: if a local hop fails (process down), the caller
  still falls back to the Flask API directly.
- Every hop logs its route, e.g.
  `ScoreRequest -> Card Scorer via local (http://127.0.0.1:8002/submit)` or
  `... via mailbox/remote (https://agentverse.ai/...)`. On startup each
  agent prints `Local agent routing: on (...)` or `off`.

Set `LOCAL_AGENT_ROUTING=off` to go back to resolving everything through
Agentverse.

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
> Your whole credit card wallet, in chat. Built for college students with
> more than one card. Ask which card to use at any store, or how to pay
> with Visa Flexible Credential (credit, debit or installments, simulated).
> Turn on Debt Guard when you're carrying a balance and it stops picking
> cards that would charge you interest. See every card's balance, usage,
> APR and due date. Find out how long a balance takes to pay off on the
> minimum, whether an annual fee is worth it, and what's due soon. Approve
> a payment or cancel a subscription with a "yes". Ask any credit question
> in plain words. Every number comes from a real rewards-vs-interest
> engine, not an LLM. Nothing is paid or canceled without your "yes", and
> it never suggests opening new cards. Say "help" to see everything.

Keywords: `credit card`, `which card`, `students`, `debt`, `due dates`,
`rewards`, `personal finance`, `debt guard`, `visa flexible credential`,
`annual fee`, `pay off credit card`, `credit utilization`.

**Card Scorer** (discoverable by other agents, not meant for chat):
> Scores a student's credit cards for a given purchase (merchant + amount)
> and returns the best card, why, and the runner-up, using real
> rewards-vs-interest math -- no LLM in the scoring path. Callable by any
> agent that needs a card recommendation.

Keywords: `card scoring`, `rewards`, `cashback`, `merchant category`,
`credit card recommendation`.

**Payment Planner** (discoverable, not meant for chat):
> Tracks a student's due dates, subscriptions, and annual fees, and
> executes approve/pay/dismiss actions, but only for Pocket Pilot, on
> behalf of a user who said "yes". Write requests from any other agent are
> refused as unauthorized; due-soon and impact reads are open.

Keywords: `due dates`, `bill reminders`, `subscriptions`, `payments`,
`personal finance automation`.

**Merchant Resolver** (discoverable, not meant for chat):
> Turns a store name into a merchant category code (MCC), category, and
> confidence for card rewards -- deterministic, no LLM. When it's unsure, it
> pays a small Coinbase x402 lookup (test USDC, hard daily cap) instead of
> guessing silently. Callable by any agent that needs to know what kind of
> store a purchase is at.

Keywords: `merchant category code`, `MCC`, `store category`, `merchant
resolution`, `rewards categories`.

Send each agent a handful of test messages from its **Testing** dashboard
(~10 interactions, per the setup guide) so it has activity before judges
search for it.

## Use it entirely in ASI:One

Everything the phone app does works in ASI:One chat. You don't need the
app. Open [asi1.ai](https://asi1.ai), search "Pocket Pilot" (or a keyword
above), and start a conversation. @-mentions (`@agent1... yes`) and curly
quotes (“ ” ’) are handled. Replies are short plain text, no tables.

| App screen | Say this in ASI:One | Reply comes from |
|---|---|---|
| Home: cards, usage, Debt Guard | "Show my cards" / "How am I doing?" | `GET /api/wallet` |
| Home: one card | "Tell me about Aurum Gold" (or just "aurum") | `GET /api/wallet` (incl. `usage_tip`) |
| Home: payback plan | "How long to pay off Aurum Gold?" / "What if I only pay the minimum?" | `GET /api/payback/<card>` |
| Home: impact chips | "How much have you saved me?" | `/api/impact`, else the wallet's `impact` |
| Home: Debt Guard toggle | "I'm carrying a balance" / "Turn off Debt Guard" | `POST /api/settings`, then re-answers your last purchase question |
| Pick | "Which card should I use at Whole Foods for $84.50?" | Card Scorer -> Merchant Resolver -> `POST /api/pick` |
| Pick: store type | "What kind of store is Costco?" | Merchant Resolver |
| Visa Flexible (simulated) | "How should I pay at Best Buy for $600?" | `POST /api/vfc/authorize` |
| Visa Flexible rules | "Show my Visa rules" | `GET /api/vfc/rules` (says which rule applies now) |
| Alerts | "Anything due soon?" then "yes" / "no" | Payment Planner -> `/api/notifications` |
| Alerts: annual fee | "Is my Voyager fee worth it?" | the `annual_fee` notification's data (advice only) |
| Coach | "Why did my score drop?" / "Tell me about credit scores" | `POST /api/coach` |
| Everything | "help" | grouped list: Pay smart / Never miss a deadline / Understand your credit |

Card names match case-insensitively and partially ("aurum", "zero intro",
"voyager"). An unknown name gets a list of your cards. "What if I only pay
the minimum?" uses the card you last asked about.

### Example prompts, by feature

Pay smart
- "Which card should I use at Whole Foods for $84.50?"
- "What kind of store is Costco?"
- "How should I pay at Whole Foods for $84.50?"
- "How should I pay at Best Buy for $600?"
- "Show my Visa rules"
- "I'm carrying a balance" -> re-answers your last pick or Visa question
- "Turn off Debt Guard"

Never miss a deadline
- "Anything due soon?" -> "Reply yes to schedule $640 to Aurum Gold on Oct 29."
- "yes" / "no" (only right after it asks; only the person who was asked can answer)
- "Show my cards" / "How am I doing?"
- "Is my Voyager fee worth it?"
- "How much have you saved me?"

Understand your credit
- "Tell me about Aurum Gold"
- "How long to pay off Aurum Gold?"
- "What if I only pay the minimum?"
- "Why did my score drop?"
- "help"

Demo only (`DEMO_MODE=on`): "reset demo".

### Safety in chat

- Pending approvals and the last purchase question are keyed by
  `f"{sender}:{session}"`: someone else in the same session can't say yes
  for you.
- Pocket Pilot says "Done" only when the write worked, or the server says
  it's already done (`not_found`). Any other failure replies "I couldn't do
  that, so nothing was paid. Try again." and keeps the action pending.
- Annual fee checks and payback plans are advice only. Nothing to approve.

### Not supported: proactive reminders

Pocket Pilot only replies; it never messages you first. uagents can send
from an interval handler (`on_interval(..., messages=ChatMessage)`,
`InternalContext.send` in `uagents/context.py`), but an interval context
gets a fresh random session (`Agent._build_context`), and Fetch's ASI:One
docs only describe agents replying to a user's message. Nothing confirms
that ASI:One shows a message the user didn't prompt. Ask "anything due
soon?" instead.

## Coinbase x402: agents that earn and pay (test network only)

Our agents both **earn** and **pay** over [x402](https://www.x402.org/)
(HTTP 402 Payment Required), with test USDC on **Base Sepolia**, never real
money. Wallets are CDP Server Wallet accounts (Coinbase Developer Platform),
so private keys stay inside CDP.

- **Earn:** `x402_server.py` sells two endpoints to any agent:
  - `POST /x402/best-card` `{merchant, amount, debt_guard?}` costs $0.001.
    It returns the best card, the reason, the MCC and the runner-up, from
    the same engine as `/api/pick`.
  - `POST /x402/merchant-data` `{merchant}` costs $0.001. Its answers come
    from a **simulated** merchant directory (`x402_merchant_data.json`),
    and every reply says so.

  An unpaid request gets `402` with a `PAYMENT-REQUIRED` header giving the
  price, network, test USDC and our address. A paid retry is verified and
  settled by the facilitator, and the answer comes back with a
  `PAYMENT-RESPONSE` receipt carrying the tx hash. A request we reject
  (bad input, engine down) is never settled, so the caller isn't charged.
- **Never charged without the answer:** every facilitator call is logged
  with its duration and exact error, and a failed settle is retried once.
  - Before giving up, the server asks the chain whether the payment went
    through anyway (e.g. it settled but the reply was lost). If it did, the
    caller gets the answer and the tx.
  - If it really failed, the caller gets a JSON error with the reason and
    `"charged": false` (checked on-chain), instead of x402's bare `402 {}`.
  - A signed payment stays usable for only 120 seconds.
- **Pay:** when Merchant Resolver is unsure about a store (confidence below
  0.6), it pays `/x402/merchant-data` from its own wallet and uses the
  answer only if it's more confident. Each store is paid for at most once
  per run.
- **Spending caps:** the paying wallet has a hard daily cap
  (`X402_DAILY_CAP_USD`, default $0.05) and a per-call max
  (`X402_MAX_PER_CALL_USD`, default $0.01).
  - Only confirmed payments count against the cap: a receipt with a tx, or
    the chain showing our payment was used. A payment that fails costs
    nothing against the cap.
  - While a payment is in flight its amount is held, so two payments at
    once can't both slip under the cap.
  - Over either limit, it doesn't pay, keeps the free answer, and logs why:
    `x402: didn't pay or failed (over daily cap: spent $0.05 of $0.05 today ...)`.
  - It only ever signs for Base Sepolia test USDC.
  - x402's own `spend_controls` enforces the per-call max as a second layer.
- **Testnet only:** any `X402_NETWORK` other than `eip155:84532` and the
  x402 service, the paying resolver, the demo and `run_all.py` refuse to
  start.
- **Off by default without keys:** if any of `CDP_API_KEY_ID`,
  `CDP_API_KEY_SECRET` or `CDP_WALLET_SECRET` is missing (or
  `X402_ENABLED=off`), every agent works exactly as before and logs
  `x402: off (missing CDP_WALLET_SECRET in .env). Everything else works as before.`
  Only key names are ever logged, never values.
- **Chat:** "How much have the agents earned?" (or "...spent?") replies:
  ```
  Coinbase x402 on Base Sepolia, test USDC (not real money).
  Earned: $0.004 from 4 paid calls by other agents.
  Spent: $0.003 on 3 merchant lookups.
  Today's cap: $0.047 of $0.050 left (max $0.010 per call).
  Latest tx: https://sepolia.basescan.org/tx/0x...
  ```
  Earnings and spending are logged in `agents/.x402/` (gitignored).

Built on `x402==2.25.0` (Flask middleware + `requests` client) and
`cdp-sdk==1.51.0`. The facilitator is the public
`https://x402.org/facilitator`, which needs no key and supports Base
Sepolia. Not used: `coinbase-agentkit` (0.7.4 pins `x402<2`) and Coinbase's
Payments MCP (its client wrapper `@x402/mcp` is TypeScript only).

| File | What it does |
|---|---|
| `x402_server.py` | The paid endpoints (earn). Flask on `X402_PORT` (8010). |
| `x402_payer.py` | Pays an x402 endpoint within the caps (pay). Never raises; returns the answer or why it didn't pay. |
| `paid_lookup.py` | Merchant Resolver's paid lookup + per-store cache. |
| `x402_ledger.py` | Earned/spent log and `SpendGuard` (caps). |
| `x402_facilitator.py` | Logs facilitator calls, retries settle once, checks on-chain before calling a payment failed. |
| `x402_chain.py` | Asks Base Sepolia whether a payment's authorization was used (and finds the tx). |
| `agent_timeouts.py` | How long agents wait for each other (longer with x402 on). |
| `x402_config.py` | `.env` settings, testnet guard, on/off reason. |
| `x402_wallet.py` | CDP accounts, faucet, balances. |
| `x402_report.py` | The chat reply. |
| `x402_setup.py` | One-time: accounts + test USDC. |
| `x402_demo_client.py` | "Another AI shopping agent" buying an answer. |

### Setup

1. Create a CDP API key and a Wallet Secret at
   [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com). Put them in
   the repo's `.env` as `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` and
   `CDP_WALLET_SECRET`. The `X402_*` settings in `.env.example` all have
   safe defaults.
2. `pip install -r requirements.txt` (adds `x402` and `cdp-sdk`).
3. `python x402_setup.py`. This creates three accounts:
   - `pocket-pilot-seller`, which receives earnings
   - `pocket-pilot-buyer`, which Merchant Resolver pays from
   - `shopping-agent-demo`, which the demo client pays from

   It prints their addresses and asks CDP's faucet for test USDC for the
   two paying accounts. If the faucet refuses (rate limit), wait and run it
   again, or use the [CDP faucet page](https://portal.cdp.coinbase.com/products/faucet).
   `python x402_setup.py --no-faucet` shows the balances.
4. Start everything as usual. `python run_all.py` starts `x402_server.py`
   first when x402 is on. Or run `python x402_server.py` on its own.

### Run the demo client

```powershell
python x402_demo_client.py                                   # Whole Foods, $84.50
python x402_demo_client.py --merchant Costco --amount 42 --debt-guard
```

It prints each step: `[1]` the unpaid POST and the `402` (price $0.001,
Base Sepolia, USDC address, our address), `[2]` its wallet and the signed
payment within its caps, `[3]` the answer (best card, reason, MCC) and the
receipt with a Basescan link. Its spending is logged separately, in
`.x402/demo-client/`.

If `[3]` says `No answer`, the message gives the reason and whether you
were charged. `x402_server.py`'s log shows the facilitator's exact error,
e.g. `facilitator settle attempt 1 returned failure in 0.4s:
invalid_exact_evm_transaction_failed: ...`. That one is the public
facilitator failing to broadcast to Base Sepolia; it's usually transient,
so run the demo again.

With x402 on, Card Scorer waits 7s for Merchant Resolver (4s off), and
Pocket Pilot waits 15s for Card Scorer (10s off), since a paid lookup comes
first.

### 30-second judge script

1. **Earn (10s).** Run `python x402_demo_client.py`. "Another AI agent asks
   Pocket Pilot which card to use. It gets HTTP 402 with a price, $0.001 in
   test USDC. It pays from its own wallet, retries, and gets the answer."
   Click the Basescan link to show the real USDC transfer to our address.
2. **Pay (10s).** In ASI:One, ask "What kind of store is Night Owl Tacos?"
   Point at Merchant Resolver's log: `unsure about 'Night Owl Tacos' (0.30);
   trying a paid x402 lookup` -> `paid $0.001 test USDC via x402, tx 0x...`
   -> `dining 5814 (0.85, paid_lookup_x402)`. "Our own agent paid for better
   data instead of guessing."
3. **Responsible (10s).** Ask "How much have the agents earned?" to see
   earned, spent, and the remaining daily cap. "It has a hard daily cap
   from `.env`. Over it, it doesn't pay and falls back to the free answer.
   It only runs on a test network, and it refuses to start on a mainnet."

## Known gaps on this server branch

`server/app.py` doesn't have `/api/pay`, `/api/impact`, `/api/log`, or
`/api/demo/reset`.
- "How much have you saved me?" falls back to `/api/wallet`'s `impact`.
- "I paid $40 at Target" replies "I couldn't do that, so nothing was paid"
  until `/api/pay` exists, so it's left out of "help".
- "reset demo" needs `DEMO_MODE=on` *and* `/api/demo/reset`. Until then,
  restart `server/app.py` to reset (state is in memory).

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

## 3-minute demo, ASI:One only

No phone app. Before you start: `server/app.py` running (`FLASK_DEBUG=0`),
`python run_all.py` running with all four seeds set, Pocket Pilot's mailbox
connected, a fresh ASI:One chat with Pocket Pilot open. Restart the server
first so Debt Guard is off and no alerts are approved yet. Replies below
are from the demo profile; Claude-worded lines (pick reason, coach) vary.

**0:00 Intro (15s).** "Students juggle three to five cards. Pocket Pilot is
the whole wallet, in chat, on ASI:One. No app needed."

**0:15 "Show my cards"** (20s)
> Your cards: Aurum Gold: $640.00 of $5,000.00 (13% used), 29.9% APR, due
> Oct 30 ... Total: $2,140.00 of $24,500.00 (9% used). Debt Guard is off.

Say: "Every number is from our engine, not the LLM."

**0:35 "Which card should I use at Whole Foods for $84.50?"** (20s)
> Aurum Gold earns 4% on grocery, $3.38 back ... Runner-up: Steady 2%.

Say: "Behind this: Pocket Pilot asked Card Scorer, which asked Merchant
Resolver. Three agents, two hops."

**0:55 "How should I pay at Whole Foods for $84.50?"** (15s)
> Pay with credit on Aurum Gold: you can pay this off in full, so it earns
> $3.38 (4% on grocery) with no interest.

**1:10 "I'm carrying a balance"** (20s)
> Debt Guard is on. Same purchase, new answer: Pay with debit: you're
> carrying a balance, so credit would start charging interest today. Debit
> costs $0. ...

Say: "Same purchase, new answer. It won't let you pay 29.9% for 4% back."

**1:30 "Show my Visa rules"** (15s)
> 1) If you can pay it off in full -> credit on your best rewards card.
> 2) If you're carrying a balance and checking covers it after a $100
> buffer -> debit, $0 interest. ... Right now, for your $84.50 at Whole
> Foods, rule 2 applies.

Then say **"Turn off Debt Guard"** (it re-answers again; no need to read it out).

**1:45 "Anything due soon?"** then **"yes"** (25s)
> Aurum Gold is due Oct 30. Pay $640 on Oct 29, after payday? ... Reply yes
> to schedule $640 to Aurum Gold on Oct 29.
>
> Done. Scheduled $640 to Aurum Gold on Oct 29. Next: Free trial converts
> tomorrow. StreamBox ... Reply yes to cancel it.

Say: "Nothing moves without a yes, and only from the person who was asked.
Payment Planner refuses writes from any agent but Pocket Pilot." Then say
**"no"** to leave StreamBox alone.

**2:10 "Tell me about Aurum Gold"**, then **"What if I only pay the minimum?"** (20s)
> Aurum Gold: $640.00 at 29.9% APR. Pay in full: 1 month, $0.00 interest.
> Minimum only: 42 months (about 3.5 years), $391.85 interest.

**2:30 "Is my Voyager fee worth it?"** (15s)
> Voyager's $95.00 annual fee comes up Nov 15. It earned you $41.00 this
> year, $54.00 less than the fee ... Switch to Voyager Basic ... and keep
> the account open ...

**2:45 "How much have you saved me?"** (10s)
> So far Pocket Pilot has saved you $16.00 in interest and $39.00 in late
> fees, and you've earned $18.40 in rewards this month.

**2:55 Close (5s).** "That's every screen of the app, in ASI:One. Say
'help' to see the rest."

Backup if a specialist is slow: answers still come back. Each specialist
falls back to the server directly, and a slow Claude explanation falls back
to the server's own wording.
