/**
 * Demo data for the Pocket Pilot app shell (App.tsx).
 * Screens and components take this data as props — they do not hard-code it.
 * Replace this file with your real data layer (API / Capital One Nessie, etc.)
 * when you wire up live balances. Ranking below is a demo for the
 * $84.50 grocery example only; see README "What is demo-only".
 */

import type {
  AlertItem,
  ChatMessage,
  CreditCardData,
  FundingRule,
  Installment,
  MoneyKeptItem,
  PaybackComparisonData,
  RankedCard,
  Totals,
} from './types';

export const cards: CreditCardData[] = [
  {
    id: 'aurum',
    name: 'Aurum Gold',
    last4: '1009',
    balance: 640,
    limit: 5000,
    utilization: 0.13,
    apr: 29.9,
    dueDate: 'Oct 30',
    rewardLabel: '4% grocery',
  },
  {
    id: 'steady',
    name: 'Steady 2%',
    last4: '4821',
    balance: 310,
    limit: 3000,
    utilization: 0.1,
    apr: 24.9,
    dueDate: 'Nov 12',
    rewardLabel: '2% everything',
  },
  {
    id: 'zero',
    name: 'Zero Intro',
    last4: '3352',
    balance: 0,
    limit: 4000,
    utilization: 0,
    apr: 0,
    dueDate: 'Nov 12',
    rewardLabel: '0% intro APR',
    note: 'Sign-up bonus $340 left of $200 bonus',
  },
  {
    id: 'spin',
    name: 'Spin 5%',
    last4: '7731',
    balance: 370,
    limit: 2500,
    utilization: 0.15,
    apr: 26.2,
    dueDate: 'Nov 8',
    rewardLabel: 'Rotating 5%',
  },
  {
    id: 'voyager',
    name: 'Voyager',
    last4: '2208',
    balance: 820,
    limit: 10000,
    utilization: 0.08,
    apr: 27.4,
    dueDate: 'Nov 15',
    rewardLabel: '$95 annual fee',
    note: '$95 annual fee due Nov 15',
  },
];

export const totals: Totals = {
  balance: 2140,
  limit: 24500,
  utilization: 0.09,
};

export const moneyKept: MoneyKeptItem[] = [
  { id: 'interest', label: 'Interest avoided', amount: 16 },
  { id: 'fees', label: 'Late fees avoided', amount: 39 },
  { id: 'rewards', label: 'Rewards', amount: 18.4 },
];

export const stores = ['Whole Foods', 'Target', 'Costco', 'Shell', 'Chipotle'];

/**
 * Demo ranking for an $84.50 grocery purchase.
 * Rewards use only the bonus rates given in the design data:
 * Aurum Gold 4% on grocery ($3.38), Steady 2% on everything ($1.69).
 * Spin 5% and Voyager have no grocery bonus listed in the design data,
 * so they show $0.00 rewards for this grocery example.
 * Interest is the 3-month carry cost at each card's APR on $84.50
 * (amount × APR ÷ 12 × 3), which is how Aurum Gold reaches $6.32.
 */
export const rankedByRewards: RankedCard[] = [
  {
    card: cards[0],
    rewardText: '+$3.38',
    interestText: '-$6.32',
    netText: '-$2.94 net',
    reason: '4% on grocery',
  },
  {
    card: cards[1],
    rewardText: '+$1.69',
    interestText: '-$5.26',
    netText: '-$3.57 net',
    reason: '2% on everything',
  },
  {
    card: cards[2],
    rewardText: '+$0.00',
    interestText: '-$0.00',
    netText: '+$0.00 net',
    reason: '0% intro APR — no interest for now',
  },
  {
    card: cards[3],
    rewardText: '+$0.00',
    interestText: '-$5.54',
    netText: '-$5.54 net',
    reason: 'Rotating 5% — check this month’s category',
  },
  {
    card: cards[4],
    rewardText: '+$0.00',
    interestText: '-$5.79',
    netText: '-$5.79 net',
    reason: 'No grocery bonus shown',
  },
];

export const rankedByLowestCost: RankedCard[] = [
  rankedByRewards[2],
  rankedByRewards[0],
  rankedByRewards[1],
  rankedByRewards[3],
  rankedByRewards[4],
];

export const oneCardRules: Record<string, FundingRule> = {
  debit: {
    title: 'Why debit?',
    detail:
      "Pay with debit: you're carrying a balance, so credit would charge interest today. Checking $380 minus $100 safety buffer leaves $280.",
  },
  credit: {
    title: 'Why credit?',
    detail:
      'Pay with credit: this keeps cash in checking, but interest applies while you carry a balance.',
  },
  installments: {
    title: 'Why 4 installments?',
    detail: 'Split $600 into 4 payments of $150, due Oct 23, Nov 6, Nov 20, and Dec 4.',
  },
};

export const installments: Installment[] = [
  { id: '1', amount: 150, date: 'Oct 23' },
  { id: '2', amount: 150, date: 'Nov 6' },
  { id: '3', amount: 150, date: 'Nov 20' },
  { id: '4', amount: 150, date: 'Dec 4' },
];

export const initialAlerts: AlertItem[] = [
  {
    id: 'due-aurum',
    kind: 'due',
    title: 'Aurum Gold is due Oct 30',
    body: 'Pay $640 on Oct 29, after payday?',
    primaryLabel: 'Approve',
    secondaryLabel: 'Later',
    doneMessage: 'Done. Scheduled $640 to Aurum Gold on Oct 29.',
  },
  {
    id: 'trial-streambox',
    kind: 'trial',
    title: 'Free trial converts tomorrow',
    body: 'StreamBox $15.99',
    primaryLabel: 'Cancel trial',
    secondaryLabel: 'Keep it',
    doneMessage: "StreamBox won't charge you.",
  },
  {
    id: 'fee-voyager',
    kind: 'fee',
    title: 'Is your $95 Voyager fee worth it?',
    body: 'It earned you $41',
    primaryLabel: 'See options',
    secondaryLabel: 'Later',
  },
];

export const coachSuggestions = ['How do late fees work?', 'What if I only pay the minimum?'];

export const initialCoachMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'coach',
    text: 'Hi! Ask me about interest, fees, or paying down a card — I’ll keep it in plain words.',
  },
];

export const payback: PaybackComparisonData = {
  fullLabel: 'Pay in full',
  fullInterest: 0,
  fullMonths: 0,
  minimumLabel: 'Minimum only',
  minimumInterest: 391.85,
  minimumMonths: 42,
};

export const coachAnswers: Record<string, string> = {
  'How do late fees work?':
    'A late fee is a charge for missing the due date. It can also raise your APR on some cards, so paying on time saves more than just the fee.',
  'What if I only pay the minimum?':
    'You stay current, but the rest keeps gathering interest. That’s why the comparison below shows $391.85 in interest over 42 months, versus $0 if you pay in full.',
};
