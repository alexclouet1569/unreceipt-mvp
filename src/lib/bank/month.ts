// One client's month of bank lines, matched against receipts, as the firm
// portal shows it. Pure: the real page (src/lib/bank/load.ts) and the
// public demo (/demo/accountant) feed it rows and render the same view.

import type { BankTransaction, Receipt } from "@/lib/types";
import { DAYS_AFTER, DAYS_BEFORE, matchTransactions, type MatchReceipt, type MatchTransaction, type TransactionState } from "./match";

export type BankLineView = {
  id: string;
  bookedOn: string;
  amount: number;
  currency: string;
  description: string;
  state: TransactionState;
  // The matched receipt, for "Matched" lines.
  receipt: { id: string; merchant: string | null; day: string | null; pending: boolean } | null;
  remindedAt: string | null;
};

export type LinkCandidate = {
  id: string;
  merchant: string | null;
  day: string | null;
  total: number;
  currency: string;
};

export type BankMonthView = {
  month: string;
  // Bank lines dated in the month, money out first by date.
  lines: BankLineView[];
  counts: { out: number; matched: number; missing: number; noReceipt: number; moneyIn: number };
  // Per currency, money out without a receipt.
  missingTotals: Array<{ currency: string; amount: number }>;
  lastRemindedAt: string | null;
  // Receipts no bank line uses yet, dated near the month: what "Link a
  // receipt" offers.
  linkCandidates: LinkCandidate[];
  // Receipts of the month still without an amount: they can't be matched
  // until completed, so one of them may be a "missing" receipt.
  incompleteReceipts: number;
};

/** YYYY-MM-DD of a receipt: the date printed on it, else the purchase time in Stockholm. */
export function receiptDay(r: Pick<Receipt, "receipt_date" | "purchased_at">): string | null {
  if (r.receipt_date && /^\d{4}-\d{2}-\d{2}$/.test(r.receipt_date)) return r.receipt_date;
  if (!r.purchased_at) return null;
  const d = new Date(r.purchased_at);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** First and last day of "YYYY-MM". */
export function monthDays(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * The bank lines and receipts a month's matching needs: lines from
 * DAYS_AFTER days around the month (so a receipt near the edge goes to its
 * closest line, not the first one in the month), and receipts that could
 * pay any of those lines.
 */
export function bankWindow(month: string): {
  txFrom: string;
  txTo: string;
  receiptFrom: string;
  receiptTo: string;
} {
  const { first, last } = monthDays(month);
  const txFrom = addDays(first, -DAYS_AFTER - DAYS_BEFORE);
  const txTo = addDays(last, DAYS_AFTER);
  return { txFrom, txTo, receiptFrom: addDays(txFrom, -DAYS_AFTER), receiptTo: addDays(txTo, DAYS_BEFORE) };
}

export function toMatchReceipt(r: Receipt): MatchReceipt {
  return {
    id: r.id,
    day: receiptDay(r),
    total: r.total,
    currency: r.currency,
    homeTotal: r.home_total,
    homeCurrency: r.home_currency,
    fxSource: r.fx_source,
    merchant: r.merchant_name,
    pending: r.status === "pending_review",
  };
}

function toMatchTransaction(t: BankTransaction): MatchTransaction {
  return {
    id: t.id,
    bookedOn: t.booked_on,
    amount: Number(t.amount),
    currency: t.currency,
    description: t.description,
    linkedReceiptId: t.linked_receipt_id,
    noReceiptReason: t.no_receipt_reason,
  };
}

export function buildBankMonth(transactions: BankTransaction[], receipts: Receipt[], month: string): BankMonthView {
  const { first, last } = monthDays(month);
  const matchReceipts = receipts.map(toMatchReceipt);
  const byId = new Map(matchReceipts.map((r) => [r.id, r]));
  const { states, usedReceiptIds } = matchTransactions(transactions.map(toMatchTransaction), matchReceipts);

  const inMonth = transactions.filter((t) => t.booked_on >= first && t.booked_on <= last);
  const lines: BankLineView[] = inMonth.map((t) => {
    const state = states.get(t.id) ?? { kind: "missing" as const };
    const r = state.kind === "matched" ? byId.get(state.receiptId) : undefined;
    return {
      id: t.id,
      bookedOn: t.booked_on,
      amount: Number(t.amount),
      currency: t.currency,
      description: t.description,
      state,
      receipt: r ? { id: r.id, merchant: r.merchant, day: r.day, pending: Boolean(r.pending) } : null,
      remindedAt: t.reminded_at,
    };
  });
  lines.sort(
    (a, b) =>
      Number(a.amount >= 0) - Number(b.amount >= 0) ||
      a.bookedOn.localeCompare(b.bookedOn) ||
      a.id.localeCompare(b.id)
  );

  const counts = { out: 0, matched: 0, missing: 0, noReceipt: 0, moneyIn: 0 };
  const missingByCurrency = new Map<string, number>();
  let lastRemindedAt: string | null = null;
  for (const l of lines) {
    if (l.state.kind === "money_in") {
      counts.moneyIn++;
      continue;
    }
    counts.out++;
    if (l.state.kind === "matched") counts.matched++;
    else if (l.state.kind === "no_receipt") counts.noReceipt++;
    else {
      counts.missing++;
      missingByCurrency.set(l.currency, (missingByCurrency.get(l.currency) ?? 0) - l.amount);
      if (l.remindedAt && (!lastRemindedAt || l.remindedAt > lastRemindedAt)) lastRemindedAt = l.remindedAt;
    }
  }

  const candFrom = addDays(first, -DAYS_AFTER);
  const candTo = addDays(last, DAYS_BEFORE);
  const linkCandidates: LinkCandidate[] = matchReceipts
    .filter(
      (r) =>
        !usedReceiptIds.has(r.id) &&
        r.total != null &&
        (r.day === null || (r.day >= candFrom && r.day <= candTo))
    )
    .map((r) => ({ id: r.id, merchant: r.merchant, day: r.day, total: r.total as number, currency: r.currency }))
    .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "") || a.id.localeCompare(b.id));

  const incompleteReceipts = matchReceipts.filter(
    (r) => r.total == null && r.day !== null && r.day >= first && r.day <= last
  ).length;

  return {
    month,
    incompleteReceipts,
    lines,
    counts,
    missingTotals: [...missingByCurrency.entries()]
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    lastRemindedAt,
    linkCandidates,
  };
}

/** "Nov 3, 2026" for "2026-11-03", the same in every time zone. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
