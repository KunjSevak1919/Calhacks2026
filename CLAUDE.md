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

## Design system (app/)

**Rule: use theme tokens and `components/ui/` only. No hard-coded colors or sizes in screens.**

### Tokens (`app/theme.ts`)

| Token | Value | Use |
|---|---|---|
| `colors.background` | `#F6F7FB` | Screen background |
| `colors.surface` | `#FFFFFF` | Cards, sheets |
| `colors.surfaceSubtle` | `#EEF1F6` | Chip fills, skeleton |
| `colors.border` | `#E3E7EF` | Dividers, input borders |
| `colors.text` | `#0F172A` | Body copy |
| `colors.muted` | `#5B6475` | Labels, captions |
| `colors.primary` | `#111827` | Primary button fill |
| `colors.onPrimary` | `#FFFFFF` | Text on primary |
| `colors.good` / `colors.goodFill` | `#047857` / `#E7F7EF` | Money saved, success |
| `colors.warn` / `colors.warnFill` | `#B45309` / `#FEF3E2` | Interest, warnings |
| `colors.coach` / `colors.coachFill` | `#4F46E5` / `#EEF0FF` | AI coach |
| `font.label/body/title/screen/hero` | 13/15/17/22/32 | Type scale |
| `type.ui/uiMedium/uiSemi/uiBold` | Manrope variants | UI text |
| `type.mono/monoSemi/monoBold` | IBM Plex Mono variants | Numbers, percentages |
| `radius.xl` / `radius.md` | 20 / 14 | Cards / buttons & chips |
| `spacing.xs…xxl` | 4/8/12/16/20/24/32 | Layout gaps |
| `shadow.soft` / `shadow.stack` | Low-opacity, large blur | Cards / stacked cards |
| `hit.min` | 44 | Minimum touch target |

### Shared components (`app/components/ui/`)

| Component | Purpose |
|---|---|
| `Screen` | `SafeAreaView` + `ScrollView`, standard padding, `RefreshControl` prop |
| `Card` | Surface bg, `radius.xl`, soft shadow, optional `accent` left-border |
| `Button` | `primary` / `secondary` / `ghost` variants; wraps `PressScale`; min 44 px |
| `Chip` | Pill shape; `default` / `good` / `warn` / `coach` / `active` variants |
| `StatTile` | Icon + `MoneyText` count-up + label; used for impact numbers |
| `AnimatedNumber` | Count-up for plain numbers; IBM Plex Mono |
| `PressableScale` | Re-export of `PressScale`; scale-to-0.97 + light haptic |
| `Toast` | Imperative slide-down banner; `show(message, variant)` via ref |
| `SectionHeader` | Uppercase muted label, letter-spacing 0.8 |

### Animation rules
- Use **Reanimated** (`react-native-reanimated`) for all motion — it animates on web too.
- Never use React Native's `Animated` API in new code.
- Respect `useReducedMotion()` — skip non-essential animation when true.
- Spring config for card/hero entrance: `damping 16, stiffness 180`.
- Stagger list items by 60 ms per index.

## Rules for the app (app/)

- Before using any API endpoint, curl it against the running server and use the exact response fields. Never guess field names.
  Example: `curl -s -X POST http://localhost:5001/api/pick -H "Content-Type: application/json" -d '{"merchant":"Whole Foods","amount":84.5}' | python3 -m json.tool`
- Keep the types in `app/api.ts` matching the real responses.
- Money and number formatting must never crash on missing values. Show "—" instead.
- The server URL lives only in `app/config.ts`.
- Test in the browser after every change. LayoutAnimation does not animate on web; that is expected, so don't change it.
