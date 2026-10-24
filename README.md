# Pocket Pilot

Your credit cards, on autopilot. Most apps help you earn points. Pocket Pilot makes sure you keep your money.

## Run the backend

```bash
cd server
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env    # add keys when you have them; everything works offline without them
python app.py                 # http://localhost:5001
pytest                        # run the tests
```

Without keys, the server uses demo data in `server/pocketpilot/data/demo_user.json`
and canned Claude answers, so you can build the app right away.

## API (all JSON)

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/wallet` | Cards, balances, usage, due dates, totals, impact numbers |
| POST | `/api/pick` | `{merchant, amount, mcc?, lat?, lng?, place_types?}` -> ranked cards + reason |
| GET | `/api/notifications` | Proactive alerts: due dates, annual fees, credits, sign-up bonus |
| POST | `/api/notifications/<id>/approve` | User approves the suggested action |
| POST | `/api/coach` | `{question}` -> Ask Coach answer from Claude |
| GET/POST | `/api/settings` | Read or set `{debt_guard: true/false}` |
| GET | `/api/payback/<card_id>` | Pay in full vs. minimum, in dollars and months |

## Fetch.ai agents

`agents/` has a team of four uAgents. Pocket Pilot is the only one users
chat with (Agent Chat Protocol, so it's usable in ASI:One, plus a couple of
REST endpoints); it delegates to three specialists over agent-to-agent
messages -- Card Scorer (which card?), Payment Planner (due dates,
approve/dismiss, pay, impact), and Merchant Resolver (what kind of store is
this?) -- with Card Scorer itself asking Merchant Resolver before every
pick. Any agent falls back to calling the Flask API directly if a
specialist doesn't answer in time. No agent does its own money math; every
number comes from the Flask API above, and there's no LLM in the
resolve/score path. See [`agents/README.md`](agents/README.md) for setup,
the architecture diagram, Agentverse/ASI:One registration steps, and a demo
script.
