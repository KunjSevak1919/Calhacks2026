import { SERVER_URL } from "./config";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CardInfo {
  id: string;
  name: string;
  last4: string;
  color: string;
  text_color: string;
  label: string;
  balance: number;
  limit: number;
  usage: number;
  apr: number;
  due: string | null;
  annual_fee: number;
  rewards_ytd: number;
  usage_tip: string | null;
}

export interface WalletResponse {
  cards: CardInfo[];
  total_balance: number;
  total_limit: number;
  usage: number;
  impact: {
    rewards_this_month?: number;
    late_fees_avoided?: number;
    interest_avoided?: number;
  };
  settings: { debt_guard: boolean };
  source: string;
}

// Ranked card as returned by /api/pick — no color/text_color here.
// Look those up from /api/wallet by card_id.
export interface RankedCard {
  card_id: string;
  name: string;
  last4: string;
  eligible: boolean;
  net: number;
  reward: number;
  interest: number;
  fee: number;
  penalty: number;
  apr: number;
  rate_label: string;
  new_usage: number;
  warnings: string[];
  bonus_note: string | null;
}

export interface PickStore {
  merchant: string;
  mcc: string;
  category: string;
  label: string;
  confidence: number;
  source: string;
  note: string | null;
}

export interface PickResponse {
  store: PickStore;
  uncertain: boolean;
  debt_guard: boolean;
  best: RankedCard;
  ranked: RankedCard[];
  reason: string;
}

// Severity is not in the API response; derive from kind in the UI.
export type NotificationKind =
  | "due"
  | "subscription"
  | "annual_fee"
  | "credit"
  | "signup_bonus";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  // action labels from the server, e.g. ["Approve","Later"] or ["Got it"]
  actions: string[];
  data: Record<string, unknown>;
  priority: number;
}

export interface PaybackResponse {
  balance: number;
  apr: number;
  pay_in_full: number;
  minimum: number;
  months_minimum: number | null;
  interest_if_minimum: number | null;
}

export interface CoachResponse {
  answer: string;
  source: string;
}

// ── VFC (Virtual Funding Controller) ──────────────────────────────────────

export interface VfcRule {
  id: string;
  when: string;
  then: string;
  why: string;
}

export interface VfcRulesResponse {
  rules: VfcRule[];
  settings: {
    debit_buffer: number;
    enabled: boolean;
    installment_threshold: number;
  };
  simulated: boolean;
}

export interface VfcInstallmentItem {
  amount: number;
  date: string;
}

export interface VfcInstallments {
  count: number;
  each: number;
  schedule: VfcInstallmentItem[];
}

export interface VfcAuthorizeResponse {
  card_id: string | null;
  card_name: string | null;
  category: string;
  funding: "credit" | "debit" | "installments";
  mcc: string;
  mcc_preserved: boolean;
  merchant: string;
  reason: string;
  rule_id: string;
  simulated: boolean;
  installments?: VfcInstallments;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `POST ${path} → ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  wallet: () => get<WalletResponse>("/api/wallet"),

  pick: (merchant: string, amount: number, foreign = false) =>
    post<PickResponse>("/api/pick", { merchant, amount, foreign }),

  notifications: () => get<Notification[]>("/api/notifications"),

  approve: (id: string) =>
    post<{ id: string; message: string }>(`/api/notifications/${id}/approve`, {}),

  dismiss: (id: string) =>
    post<{ id: string; message: string }>(`/api/notifications/${id}/dismiss`, {}),

  coach: (question: string, history?: Array<{ role: string; content: string }>) =>
    post<CoachResponse>("/api/coach", { question, history }),

  settings: () => get<{ debt_guard: boolean }>("/api/settings"),

  setSettings: (debt_guard: boolean) =>
    post<{ debt_guard: boolean }>("/api/settings", { debt_guard }),

  payback: (cardId: string) => get<PaybackResponse>(`/api/payback/${cardId}`),

  vfcRules: () => get<VfcRulesResponse>("/api/vfc/rules"),

  vfcAuthorize: (merchant: string, mcc: number, amount: number) =>
    post<VfcAuthorizeResponse>("/api/vfc/authorize", { merchant, mcc, amount }),
};
