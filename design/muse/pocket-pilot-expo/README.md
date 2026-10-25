# Pocket Pilot — Expo (React Native + TypeScript)

Premium credit-card copilot for college students. Tagline: “Most apps help you earn points. Pocket Pilot makes sure you keep your money.”

React Native components only. No HTML, no CSS files, no web-only libraries. Gradients use `expo-linear-gradient`. Blur is not used in this build, so `expo-blur` is not a dependency — add it only if a future surface needs it.

## Run it

```bash
npm install
npx expo start
# then press i (iOS simulator), a (Android emulator), or scan the QR code
npm run typecheck
```

`App.tsx` is the demo shell: it wires the design data from `data.ts` into the prop-driven screens and holds tab / Debt Guard / funding / alerts / chat state. Replace `data.ts` and the handlers in `App.tsx` with your navigation and API layer for production.

## A version note you should read before installing

You asked for Reanimated v3 **and** for versions compatible with the latest Expo SDK. Those two do not line up cleanly:

- **Latest Expo SDK at time of writing: SDK 57** (React Native 0.86.2, React 19.2.3). SDK 57 bundles **Reanimated 4.5.1**, Worklets 0.10.1, and Gesture Handler 2.32.0.
- Pinning Reanimated 3.x would break SDK 57 compatibility.

So this project pins the SDK 57 versions below, and **all animation code uses only the Reanimated 3-compatible API surface** (`useSharedValue`, `useAnimatedStyle`, `withSpring`, `withTiming`, `withRepeat`, `interpolate`, `interpolateColor`, `useAnimatedReaction`, `runOnJS`). No Reanimated 4-only API is used, so the same files also run on a Reanimated 3 build if you deliberately target an older SDK (e.g. SDK 54) instead.

If you must stay on Reanimated 3.x, do not use this `package.json` — use an SDK 54 set instead and run `npx expo-doctor` after installing.

## Packages

| Package | Version | Why |
| --- | --- | --- |
| `expo` | `~57.0.9` | SDK 57 |
| `react` | `19.2.3` | SDK 57 |
| `react-native` | `0.86.2` | SDK 57 |
| `expo-linear-gradient` | `~57.0.1` | Card art gradients |
| `react-native-reanimated` | `~4.5.1` | All animations (3-compatible API only, see above) |
| `react-native-worklets` | `~0.10.1` | Required by Reanimated 4 |
| `react-native-gesture-handler` | `~2.32.0` | `GestureHandlerRootView` at the app root |
| `typescript` (dev) | `~5.9.2` | Type checking |
| `@types/react` (dev) | `~19.2.0` | Type definitions |

Install with `npx expo install …` (not plain `npm install`) so Expo resolves the SDK-compatible versions for you, then run `npx expo-doctor`.

## File list

### Root

| File | What it is |
| --- | --- |
| `App.tsx` | Demo shell: theme header (System/Light/Dark cycle), 5-tab bar, and state wiring for all screens |
| `theme.ts` | All design tokens + `ThemeProvider` + `useTheme()` |
| `types.ts` | Shared domain types + money formatters |
| `data.ts` | Demo data for `App.tsx` only (exact design cards, numbers, and copy) |
| `package.json` | Dependencies and scripts |
| `app.json` | Expo app config (portrait, automatic light/dark UI style) |
| `babel.config.js` | `babel-preset-expo` + Reanimated plugin (last) |
| `tsconfig.json` | Strict TypeScript config |
| `README.md` | This file |

### Components (`components/`)

| File | Component | Props (summary) |
| --- | --- | --- |
| `CreditCard.tsx` | `CreditCard` — gradient card art, name, ••last4, balance/limit, usage bar, APR/due/reward line | `card: CreditCardData; onPress?: (card) => void; selected?: boolean; accessibilityHint?: string` |
| `CardStack.tsx` | `CardStack` — fan-out / collapse stack | `cards: CreditCardData[]; expanded: boolean; selectedCardId?: string; onCardPress: (card) => void; onToggle: () => void` |
| `UsageBar.tsx` | `UsageBar` — animated fill, amber above 30% | `value: number (0–1); barColor?: string; testID?: string` |
| `ImpactStrip.tsx` | `ImpactStrip` — “Money kept this month” with count-up numbers | `title: string; items: MoneyKeptItem[]` |
| `StoreChip.tsx` | `StoreChip` — pill chip for stores and Coach suggestions | `label: string; selected?: boolean; onPress?: () => void; accessibilityLabel?: string` |
| `RankedCardRow.tsx` | `RankedCardRow` — ranked card with +rewards / −interest / net | `rank: number; ranked: RankedCard; isWinner?: boolean; dimmed?: boolean; onPress?: (ranked) => void` |
| `FundingChip.tsx` | `FundingChip` — sliding Credit / Debit / 4 Installments segmented control | `selected: FundingOption; onSelect: (option: FundingOption) => void` |
| `AlertCard.tsx` | `AlertCard` — alert with Approve/Later (or Cancel/Keep, See options) and approve → check → collapse | `alert: AlertItem; onPrimary: (alert) => void; onSecondary: (alert) => void` |
| `ChatBubble.tsx` | `ChatBubble` — Coach (left) / user (right) bubble | `message: ChatMessage` |
| `PaybackComparison.tsx` | `PaybackComparison` — pay-in-full vs minimum-only | `data: PaybackComparisonData` |
| `DebtGuardSwitch.tsx` | `DebtGuardSwitch` — custom switch with colour-morph track | `value: boolean; onValueChange: (value) => void; explainer?: string; label?: string` |
| `PrimaryButton.tsx` | `PrimaryButton` — accent filled button, 48pt | `title: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string` |
| `SecondaryButton.tsx` | `SecondaryButton` — outlined button, 48pt | Same as `PrimaryButton` |
| `Skeleton.tsx` | `Skeleton` — shimmer placeholder | `width?: number \| string; height?: number; borderRadius?: number; style?: ViewStyle` |

### Screens (`screens/`)

| File | Screen |
| --- | --- |
| `Wallet.tsx` | `WalletScreen` |
| `Pay.tsx` | `PayScreen` |
| `OneCard.tsx` | `OneCardScreen` |
| `Alerts.tsx` | `AlertsScreen` |
| `Coach.tsx` | `CoachScreen` |

Every screen takes its data as typed props, has loading (skeletons), empty, and error states, and hard-codes no card numbers. The error state uses the exact design copy: “Can't reach the server. Nothing was paid.”

## Screen prop types

### `WalletScreenProps` (`screens/Wallet.tsx`)

```ts
type WalletScreenProps = {
  greeting: string; // e.g. "Good afternoon, Kirtan"
  cards: CreditCardData[];
  totals: Totals;
  moneyKept: MoneyKeptItem[];
  debtGuard: boolean;
  onDebtGuardChange: (value: boolean) => void;
  nextDue: { cardName: string; date: string };
  onSelectCard?: (card: CreditCardData) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};
```

### `PayScreenProps` (`screens/Pay.tsx`)

```ts
type PayScreenProps = {
  stores: string[];
  selectedStore: string;
  onStoreChange: (store: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  debtGuard: boolean;
  onDebtGuardChange: (value: boolean) => void;
  recommendation: PayRecommendation | null;
  ranked: RankedCard[];
  winningCard: CreditCardData | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};
```

### `OneCardScreenProps` (`screens/OneCard.tsx`)

```ts
type OneCardScreenProps = {
  cardName: string; // "Visa Flexible"
  funding: FundingOption; // 'credit' | 'debit' | 'installments'
  onFundingChange: (funding: FundingOption) => void;
  rule: FundingRule; // { title: string; detail: string } for the selected funding
  checkingBalance: number;
  safetyBuffer: number;
  availableAfterBuffer: number;
  installments: Installment[]; // { id: string; amount: number; date: string }
  purchaseAmount: number;
  simulated: boolean;
  merchantCategoryKept: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};
```

### `AlertsScreenProps` (`screens/Alerts.tsx`)

```ts
type AlertsScreenProps = {
  alerts: AlertItem[];
  onAlertPrimary: (alert: AlertItem) => void;
  onAlertSecondary: (alert: AlertItem) => void;
  confirmationMessage?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};
```

### `CoachScreenProps` (`screens/Coach.tsx`)

```ts
type CoachScreenProps = {
  messages: ChatMessage[];
  suggestions: string[];
  onSuggestion: (suggestion: string) => void;
  onSend: (text: string) => void;
  payback: PaybackComparisonData;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};
```

### Shared domain types (`types.ts`)

```ts
type CardId = 'aurum' | 'steady' | 'zero' | 'spin' | 'voyager';

type CreditCardData = {
  id: CardId;
  name: string; // e.g. "Aurum Gold"
  last4: string; // e.g. "1009"
  balance: number;
  limit: number;
  utilization: number; // 0–1
  apr: number;
  dueDate: string; // display date, e.g. "Oct 30"
  rewardLabel: string; // e.g. "4% grocery"
  note?: string;
};

type Totals = { balance: number; limit: number; utilization: number };
type MoneyKeptItem = { id: string; label: string; amount: number };
type RankedCard = {
  card: CreditCardData;
  rewardText: string; // e.g. "+$3.38"
  interestText: string; // e.g. "-$6.32"
  netText: string; // e.g. "-$2.94 net"
  reason: string;
};
type PayRecommendation = {
  winningCardId: CardId;
  headline: string;
  detail: string;
  storeTypeNote: string;
};
type FundingOption = 'credit' | 'debit' | 'installments';
type FundingRule = { title: string; detail: string };
type Installment = { id: string; amount: number; date: string };
type AlertKind = 'due' | 'trial' | 'fee';
type AlertItem = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  doneMessage?: string;
};
type ChatRole = 'user' | 'coach';
type ChatMessage = { id: string; role: ChatRole; text: string };
type PaybackComparisonData = {
  fullLabel: string;
  fullInterest: number;
  fullMonths: number;
  minimumLabel: string;
  minimumInterest: number;
  minimumMonths: number;
};
```

## Design tokens (`theme.ts`)

- **Colours, both themes:** `background`, `surface`, `elevated`, `textPrimary`, `textSecondary`, `textMuted`, `accent`, `onAccent`, `success`, `warning`, `danger`, `border`, `track`, `skeletonBase`, `skeletonHighlight`, `shadow`, `transparent`, `cardText`, `cardTextSecondary`, `cardSheen`, `cardOverlay`, `tabBarBackground`, `tabBarBorder`, `tabInactive`.
- **Card art (same in light and dark):** `cardArt.aurum` (warm gold), `cardArt.steady` (navy), `cardArt.zero` (graphite), `cardArt.spin` (orange), `cardArt.voyager` (deep teal), `cardArt.flexible` (One Card). Each is `{ gradient: [string, string], accent: string }`.
- **Spacing:** `0, 4, 8, 12, 16, 20, 24, 32, 40`.
- **Radius:** `12, 16, 20, 24, full (999)`. Cards and buttons use 16–24 as specified.
- **Type:** sizes `12, 14, 16, 18, 22, 28, 34`; weights `400, 500, 600, 700, 800`; matching line heights; system sans (swap for loaded Manrope/Inter via `expo-font` if you want the exact font).
- **Shadows/elevation:** `shadows.card` (4pt, elevation 4) and `shadows.lift` (12pt, elevation 8), with a `none` token.
- **Theme hook:** `useTheme()` returns `{ theme, mode, setMode, colorScheme, reduceMotion }`. `ThemeProvider` defaults to `mode="system"` (follows `useColorScheme`); call `setMode('light' | 'dark' | 'system')` for a manual override. The demo header in `App.tsx` cycles System → Light → Dark.

**No hard-coded colours outside `theme.ts`.** Every component and screen reads colours from `useTheme()`. That includes `transparent`, card sheen/overlay, and skeleton colours, which are tokens too.

**Contrast (WCAG AA):** light text/accent/success/warning/danger on their surfaces, and the dark equivalents, are chosen to pass 4.5:1 for normal text. Card text is white on the card gradients plus an 18% black overlay. Colour is never the only signal: usage bars also show a percentage, ranked rows show numbers as text, and switches expose `accessibilityState`.

## Animations (Reanimated only, plus Gesture Handler at the root)

All durations are 150–350ms except the skeleton shimmer, which is a continuous loop and is marked as such. Every animation checks `theme.reduceMotion` (from `AccessibilityInfo`) and jumps to its end state instead of animating.

| Animation | Where | Trigger | Duration / easing |
| --- | --- | --- | --- |
| Card stack fan-out / collapse | `CardStack.tsx` | Toggle, or tap to expand | Spring, damping 20, stiffness 180 |
| Tapped card lifts | `CardStack.tsx` + `CreditCard.tsx` | Card selected | Scale 1.03, same spring; lifted shadow token |
| Winning card rises | `Pay.tsx` | Winner changes (including Debt Guard toggle) | Spring, damping 20, stiffness 180; translateY 24 → 0, scale 0.97 → 1 |
| Other ranked rows dim | `RankedCardRow.tsx` | Winner changes | 250ms `withTiming`, opacity 1 → 0.55 |
| Number count-up | `ImpactStrip.tsx` | Mount | 300ms `withTiming` via `useAnimatedReaction` |
| Usage bar fill | `UsageBar.tsx` | Layout, then load | 250ms `withTiming` |
| Switch morph | `DebtGuardSwitch.tsx` | Toggle | Spring, damping 22, stiffness 260; track colour via `interpolateColor` |
| Funding chip slide | `FundingChip.tsx` | Funding selection changes | Spring, damping 22, stiffness 260 |
| Approve → check → collapse | `AlertCard.tsx` | Primary action with a `doneMessage` | Check shown 900ms, then 250ms fade/scale collapse |
| Skeleton shimmer | `Skeleton.tsx` | Loading state | 900ms repeating sweep (continuous loop, exempt from the 150–350ms interaction range) |

## Exact design data (in `data.ts`, not in components)

- Aurum Gold ••1009: $640 of $5,000 (13%), 29.9% APR, due Oct 30, 4% grocery.
- Steady 2% ••4821: $310 of $3,000 (10%), 24.9% APR, due Nov 12, 2% everything.
- Zero Intro ••3352: $0 of $4,000, 0% intro APR, sign-up bonus $340 left of $200 bonus.
- Spin 5% ••7731: $370 of $2,500 (15%), 26.2% APR, due Nov 8, rotating 5%.
- Voyager ••2208: $820 of $10,000 (8%), 27.4% APR, $95 annual fee due Nov 15.
- Totals: $2,140 of $24,500 (9% used). Badge: “Live data · Capital One Nessie”.
- Money kept: $16 interest avoided, $39 late fees avoided, $18.40 rewards.
- Pay (Debt Guard off): “Aurum Gold: 4% on grocery, $3.38 back”. Target note: “Target counts as a discount store, not grocery.”
- Pay (Debt Guard on): “Use Zero Intro instead. Aurum Gold would earn $3.38, but its 29.9% APR would cost $6.32 over 3 months.”
- One Card (Visa Flexible, Simulated, merchant category kept): “Pay with debit: you're carrying a balance, so credit would charge interest today. Checking $380 minus $100 safety buffer leaves $280.” Installments: 4 × $150 — Oct 23, Nov 6, Nov 20, Dec 4.
- Alerts: “Aurum Gold is due Oct 30. Pay $640 on Oct 29, after payday?” [Approve] [Later]; “Free trial converts tomorrow: StreamBox $15.99” [Cancel trial] [Keep it]; “Is your $95 Voyager fee worth it? It earned you $41” [See options]. Approved: “Done. Scheduled $640 to Aurum Gold on Oct 29.”
- Coach: suggestions “How do late fees work?”, “What if I only pay the minimum?”; payback “Pay in full: $0 interest” vs “Minimum only: 42 months, $391.85 interest”.

No real bank, card-network, or app logos, names, or layouts are used. Card art is original.

## What is demo-only (replace before production)

- `data.ts` ranking is for the $84.50 grocery example only. Spin 5% and Voyager show $0.00 grocery rewards because no grocery bonus is listed for them in the design data; interest is the 3-month carry cost at each APR. A real ranking engine must use live merchant categories, rotating categories, and current balances.
- Coach answers in `App.tsx` are canned plain-words replies. Live Coach answers need a backend (Claude) integration; do not ship canned answers as if they were live advice.
- The “See options” fee action in `App.tsx` is a placeholder message. The fee-worth-it flow (keep / downgrade / cancel) is a product decision, not implemented here.
- Fonts use the system sans. Load Manrope/Inter with `expo-font` and update `fontFamily` in `theme.ts` if you need the exact typeface.

## Accessibility checklist

- Touch targets: buttons 48pt, chips and tabs 44pt minimum, switch row 44pt.
- Icon-only / tab controls carry `accessibilityLabel`; switches carry `accessibilityRole="switch"` and `checked` state; usage bars carry `progressbar` role and value.
- Reduce Motion is honoured everywhere via `theme.reduceMotion`.
- Text meets WCAG AA in both themes (see tokens above).
