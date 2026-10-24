# Pocket Pilot

Smart credit card wallet for college students juggling their credit cards.
Picks the best card for each purchase, never lets you lose money to interest
(Debt Guard), reminds you before due dates, checks annual fees, and explains
credit in plain words. Built at Cal Hacks 13.0.

## Layout

- `server/` Python + Flask API and the core engine (no LLM in the scoring path)
  - `pocketpilot/resolver.py` store -> category + likely MCC, with confidence
  - `pocketpilot/scorer.py` ranks cards by true value (rewards - interest - fees)
  - `pocketpilot/planner.py` due dates, payback plan, utilization, annual fee check
  - `pocketpilot/coach.py` Claude: explanations and Ask Coach answers
  - `pocketpilot/nessie.py` Capital One Nessie client with offline demo fallback
  - `pocketpilot/data/` cards.json, mcc.json, merchants.json, demo_user.json
- `agents/` Fetch.ai uAgents (orchestrator with chat protocol + specialists)
- `app/` Expo (React Native) phone app

## Rules

- The scorer is plain Python. Never call an LLM inside `scorer.py` or `resolver.py`.
- Claude only writes explanations and answers questions, using numbers the engine computed.
- Every money action (payments, cancellations) needs explicit user approval.
- Never recommend opening new cards or taking on debt. No affiliate links.
- Keys live in `.env` only. Never commit `.env`.
- Money is in US dollars, rounded to cents only when displayed.
- Keep functions small and tested. Run `pytest` in `server/` before committing.
