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
| GET/POST | `/api/vfc/rules` | The student's Visa Flexible Credential rules (simulated) |
| POST | `/api/vfc/authorize` | `{merchant, amount, mcc?}` -> simulated funding decision |

## Visa Flexible Credential (simulated)

[Visa Flexible Credential](https://usa.visa.com/) lets one card switch how a
purchase is funded -- credit, debit, installments, points -- by rules the
user sets in their bank app; Visa's preference engine applies those rules
at authorization. **It's issuer-bank-only: there's no public API, so this
is a simulation of the decision layer**, never a real Visa integration.
Pocket Pilot's angle: students don't know which funding option is
cheapest, so it writes and applies the rules for them, and -- unlike Curve,
which routed everything through itself and lost category bonuses -- the
real merchant category is always kept (`mcc_preserved: true` on every
response).

`server/pocketpilot/vfc.py` is the deterministic rule engine (no LLM),
reusing the existing resolver and scorer rather than duplicating either.
Four rules, in order: pay in full with your best rewards card if you're not
already carrying a balance you can't clear; otherwise debit if checking can
cover it after a safety buffer; otherwise split into 4 interest-free
installments if the purchase is large; otherwise credit on your
lowest-cost card.

```bash
curl -s -X POST http://localhost:5001/api/vfc/authorize \
  -H "Content-Type: application/json" \
  -d '{"merchant":"Best Buy","amount":600,"debt_guard":true}'
```

```json
{
  "funding": "installments",
  "card_id": null,
  "card_name": null,
  "merchant": "Best Buy",
  "mcc": "5732",
  "category": "electronics",
  "mcc_preserved": true,
  "installments": {
    "count": 4,
    "each": 150.0,
    "schedule": [
      {"date": "2026-10-23", "amount": 150.0},
      {"date": "2026-11-06", "amount": 150.0},
      {"date": "2026-11-20", "amount": 150.0},
      {"date": "2026-12-04", "amount": 150.0}
    ]
  },
  "rule_id": "installments-if-large",
  "reason": "Split into 4 payments of $150.00 every 14 days: $600.00 is a big purchase and only $280.00 is safely available for debit right now. This demo assumes 0% interest and no fees on installments.",
  "simulated": true
}
```

Ask Pocket Pilot directly in chat: "How should I pay for a $600 laptop at
Best Buy?" or "show my Visa rules."

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
