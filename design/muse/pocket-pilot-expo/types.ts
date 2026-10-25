/**
 * Shared domain types for Pocket Pilot.
 * Screens take these as props; components never hard-code card data.
 */

export type CardId = 'aurum' | 'steady' | 'zero' | 'spin' | 'voyager';

export type CreditCardData = {
  id: CardId;
  /** Exact display name, e.g. "Aurum Gold". */
  name: string;
  last4: string;
  balance: number;
  limit: number;
  /** 0–1, e.g. 0.13 for 13%. */
  utilization: number;
  apr: number;
  /** Display date, e.g. "Oct 30". Kept as a string so screens do not parse dates. */
  dueDate: string;
  /** Short reward line, e.g. "4% grocery". */
  rewardLabel: string;
  /** Optional extra line, e.g. "$95 annual fee due Nov 15". */
  note?: string;
};

export type Totals = {
  balance: number;
  limit: number;
  /** 0–1, e.g. 0.09 for 9% used. */
  utilization: number;
};

export type MoneyKeptItem = {
  id: string;
  label: string;
  amount: number;
};

export type StoreTypeNote = string;

export type RankedCard = {
  card: CreditCardData;
  /** e.g. "+$3.38" */
  rewardText: string;
  /** e.g. "-$0.00" */
  interestText: string;
  /** e.g. "+$3.38 net" */
  netText: string;
  /** Plain-words reason for this card's rank. */
  reason: string;
};

export type PayRecommendation = {
  winningCardId: CardId;
  /** Headline shown with the winning card. */
  headline: string;
  /** Plain-words detail, e.g. the Debt Guard trade-off. */
  detail: string;
  storeTypeNote: StoreTypeNote;
};

export type FundingOption = 'credit' | 'debit' | 'installments';

export type FundingRule = {
  title: string;
  detail: string;
};

export type Installment = {
  id: string;
  amount: number;
  /** Display date, e.g. "Oct 23". */
  date: string;
};

export type AlertKind = 'due' | 'trial' | 'fee';

export type AlertItem = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  /** Shown in place of the buttons after the primary action succeeds. */
  doneMessage?: string;
};

export type ChatRole = 'user' | 'coach';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

export type PaybackComparisonData = {
  fullLabel: string;
  fullInterest: number;
  fullMonths: number;
  minimumLabel: string;
  minimumInterest: number;
  minimumMonths: number;
};

export type ScreenState = {
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatMoneyWhole(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
