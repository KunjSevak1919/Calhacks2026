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

export interface RankedCard {
  id: string;
  name: string;
  last4: string;
  color: string;
  text_color: string;
  net_value: number;
  rate_label: string;
  rewards: number;
  interest_cost: number;
  fee_share: number;
}

export interface PickResponse {
  store: { label: string; category: string; confidence: number };
  uncertain: boolean;
  debt_guard: boolean;
  best: RankedCard;
  ranked: RankedCard[];
  reason: string;
}

export interface Notification {
  id: string;
  kind: "due" | "subscription" | "annual_fee" | "utilization" | "bonus";
  title: string;
  body: string;
  severity: "warn" | "info" | "ok";
  data: Record<string, unknown>;
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
    throw new Error((err as { error?: string }).error ?? `POST ${path} → ${res.status}`);
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
};
