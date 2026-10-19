/**
 * Matches bank statement lines to receipts. Pure.
 *
 * Every purchase on a business account needs a record (a receipt or an
 * invoice) for the books. This sorts each line of a statement into:
 *
 *   matched     a receipt with the same amount, a close date and the same name
 *   check       probably this receipt, but the amount, currency or name differs
 *   missing     money went out and no receipt explains it — chase the client
 *   no_receipt  the bank's own record is enough (tax account, salary, fees…)
 *   money_in    payments received; those are checked against sales, not receipts
 *
 * A wrong green is worse than an amber: the accountant books what we call
 * matched. So an exact amount alone, with a different name, is only "check".
 */

import type { Receipt } from "@/lib/types";
import type { StatementLine } from "./parse-statement";

export type MatchableReceipt = Pick<
  Receipt,
  "id" | "merchant_name" | "total" | "currency" | "receipt_date"
>;

export type LineStatus = "matched" | "check" | "missing" | "no_receipt" | "money_in";

export type ReconciledLine = {
  line: StatementLine;
  status: LineStatus;
  receiptId: string | null;
  /** Why it's "check" or "no_receipt", in one short plain-text sentence (for the CSV). */
  note: string | null;
  /** Why it's "check", for screens that show the two amounts themselves. */
  check: CheckReason | null;
};

/**
 * different_shop: same amount and date, another merchant name.
 * different_currency / different_amount: same merchant, the receipt's
 * amount (receipt.total, receipt.currency) differs from what the bank took.
 */
export type CheckReason = "different_shop" | "different_currency" | "different_amount";

export type Reconciliation = {
  lines: ReconciledLine[];
  /** Receipts no line accounts for: paid privately, in cash, or another account. */
  unmatchedReceiptIds: string[];
  summary: {
    /** Lines that need a receipt: matched + check + missing. */
    needReceipt: number;
    matched: number;
    check: number;
    missing: number;
    noReceipt: number;
    moneyIn: number;
  };
};

/** The accountant's call on a line, which beats our guess. */
export type LineOverride = "needs_receipt" | "no_receipt";

// A card purchase reaches the statement on the day or a few days later;
// the receipt date can't be much after the bank date.
const DAYS_BEFORE_BANK = 7;
const DAYS_AFTER_BANK = 1;
// "check" when the name agrees and the amount is within this share — a tip,
// a partial refund, a currency conversion.
const NEAR_AMOUNT = 0.25;

// Lines the bank's own record already documents. Matched on normalised
// text (lower case, no diacritics), as whole words or word starts.
const NO_RECEIPT_RULES: { pattern: RegExp; note: string }[] = [
  { pattern: /\bskatt(everket|ekonto)/, note: "Tax account payment — the tax account statement is the record." },
  { pattern: /\b(lon|loner|loneutbetalning)\b/, note: "Salary — the payslip is the record." },
  { pattern: /\b(egen )?overforing\b|\boverf\b/, note: "Transfer between accounts." },
  { pattern: /\binsattning\b/, note: "Deposit." },
  { pattern: /\b(bankomat|atm|kontantuttag)\b/, note: "Cash withdrawal — the cash purchases need their own receipts." },
  { pattern: /\b(bank|konto|paket|kort)avgift\b|\bavgift (konto|kort|bank)/, note: "Bank fee — the statement is the record." },
  { pattern: /\b(ranta|rantor)\b/, note: "Interest — the statement is the record." },
  { pattern: /\bamortering\b/, note: "Loan repayment — the loan statement is the record." },
];

// Words in bank texts that never identify a merchant.
const NOISE = new Set([
  "kortkop", "kop", "reservation", "res", "pg", "bg", "bankgiro", "plusgiro",
  "swish", "betalning", "autogiro", "ag", "ab", "hb", "kb", "aps", "as", "ltd",
  "inc", "gmbh", "sverige", "sweden", "se", "www", "com", "the", "och", "and",
  "malmo", "lund", "stockholm", "goteborg", "kobenhavn", "copenhagen",
]);

function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(s: string | null | undefined): string[] {
  return normalise(s ?? "")
    .split(" ")
    .filter((t) => t.length >= 2 && !NOISE.has(t) && !/^\d+$/.test(t));
}

/** Does the bank text name the same merchant as the receipt? */
export function namesAgree(bankText: string, merchant: string | null | undefined): boolean {
  const bank = nameTokens(bankText);
  const shop = nameTokens(merchant);
  if (bank.length === 0 || shop.length === 0) return false;
  return shop.some((s) =>
    bank.some(
      (b) => b === s || (Math.min(b.length, s.length) >= 4 && (b.startsWith(s) || s.startsWith(b))),
    ),
  );
}

export function noReceiptNote(bankText: string): string | null {
  const text = normalise(bankText);
  return NO_RECEIPT_RULES.find((r) => r.pattern.test(text))?.note ?? null;
}

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

const cents = (n: number) => Math.round(n * 100);

type Pair = {
  lineId: string;
  receiptId: string;
  score: number;
  status: "matched" | "check";
  note: string | null;
  check: CheckReason | null;
};

function pairFor(line: StatementLine, r: MatchableReceipt, fmt: AmountFormatter): Pair | null {
  if (r.total == null || !r.receipt_date) return null;
  const lag = dayNumber(line.date) - dayNumber(r.receipt_date);
  if (lag > DAYS_BEFORE_BANK || lag < -DAYS_AFTER_BANK) return null;

  const paid = -line.amount;
  const sameCurrency = r.currency === line.currency;
  const sameAmount = sameCurrency && cents(r.total) === cents(paid);
  const name = namesAgree(line.text, r.merchant_name);
  const datePenalty = Math.abs(lag) * 5;
  const base = { lineId: line.id, receiptId: r.id };

  if (sameAmount && name) {
    return { ...base, score: 1000 - datePenalty, status: "matched", note: null, check: null };
  }
  if (sameAmount) {
    return {
      ...base,
      score: 700 - datePenalty,
      status: "check",
      check: "different_shop",
      note: `Same amount and date, but the receipt is from ${r.merchant_name ?? "an unnamed shop"}.`,
    };
  }
  if (!name) return null;
  if (!sameCurrency) {
    return {
      ...base,
      score: 500 - datePenalty,
      status: "check",
      check: "different_currency",
      note: `The receipt is in ${r.currency} (${fmt(r.total, r.currency)}); the bank charged ${fmt(paid, line.currency)}.`,
    };
  }
  const gap = Math.abs(r.total - paid) / Math.max(paid, 0.01);
  if (gap > NEAR_AMOUNT) return null;
  return {
    ...base,
    score: 500 - datePenalty - Math.round(gap * 100),
    status: "check",
    check: "different_amount",
    note: `The receipt says ${fmt(r.total, r.currency)}, the bank ${fmt(paid, line.currency)}. A tip or a partial refund?`,
  };
}

export type AmountFormatter = (amount: number, currency: string) => string;

const plainAmount: AmountFormatter = (amount, currency) => `${amount.toFixed(2)} ${currency}`;

export function reconcile(
  statement: StatementLine[],
  receipts: MatchableReceipt[],
  options: { overrides?: Record<string, LineOverride>; formatAmount?: AmountFormatter } = {},
): Reconciliation {
  const overrides = options.overrides ?? {};
  const fmt = options.formatAmount ?? plainAmount;

  const result = new Map<string, ReconciledLine>();
  const toMatch: StatementLine[] = [];

  for (const line of statement) {
    if (line.amount >= 0) {
      result.set(line.id, { line, status: "money_in", receiptId: null, note: null, check: null });
      continue;
    }
    const override = overrides[line.id];
    const note = override === "needs_receipt" ? null : noReceiptNote(line.text);
    if (override === "no_receipt" || note) {
      result.set(line.id, {
        line,
        status: "no_receipt",
        receiptId: null,
        note: note ?? "Marked as not needing a receipt.",
        check: null,
      });
      continue;
    }
    toMatch.push(line);
  }

  // Best pairs first; each line and each receipt is used once.
  const pairs: Pair[] = [];
  for (const line of toMatch) {
    for (const r of receipts) {
      const p = pairFor(line, r, fmt);
      if (p) pairs.push(p);
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedReceipts = new Set<string>();
  const lineById = new Map(toMatch.map((l) => [l.id, l]));
  for (const p of pairs) {
    if (result.has(p.lineId) || usedReceipts.has(p.receiptId)) continue;
    usedReceipts.add(p.receiptId);
    result.set(p.lineId, {
      line: lineById.get(p.lineId)!,
      status: p.status,
      receiptId: p.receiptId,
      note: p.note,
      check: p.check,
    });
  }
  for (const line of toMatch) {
    if (!result.has(line.id)) {
      result.set(line.id, { line, status: "missing", receiptId: null, note: null, check: null });
    }
  }

  const lines = statement.map((l) => result.get(l.id)!);
  const count = (s: LineStatus) => lines.filter((l) => l.status === s).length;
  const summary = {
    matched: count("matched"),
    check: count("check"),
    missing: count("missing"),
    noReceipt: count("no_receipt"),
    moneyIn: count("money_in"),
    needReceipt: 0,
  };
  summary.needReceipt = summary.matched + summary.check + summary.missing;

  return {
    lines,
    unmatchedReceiptIds: receipts.filter((r) => !usedReceipts.has(r.id)).map((r) => r.id),
    summary,
  };
}
