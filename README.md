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

## Fetch.ai agent

`agents/` has a uAgents agent that puts Pocket Pilot in chat: Agent Chat
Protocol (so it's usable in ASI:One), Agentverse mailbox registration, and a
couple of REST endpoints for the app to call directly. It does no money math
itself -- every number it says comes from the Flask API above. See
[`agents/README.md`](agents/README.md) for setup, Agentverse/ASI:One steps,
and a demo script.
