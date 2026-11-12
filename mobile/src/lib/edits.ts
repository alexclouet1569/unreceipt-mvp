// Editing a receipt on the phone, pure (tested): reading an amount the way
// people type it, and applying a saved change to the list row at once.
// The server stays the judge: PATCH /api/receipts/[id] answers with the
// status, and the next refresh brings its full row.

import type { MobileReceipt } from "@/lib/mobile/types";

/** The currencies PATCH /api/receipts/[id] accepts (CURRENCY_OPTIONS). */
export const EDITABLE_CURRENCIES = ["SEK", "EUR", "USD", "GBP"] as const;
export type EditableCurrency = (typeof EDITABLE_CURRENCIES)[number];

export const CATEGORIES = [
  "meals",
  "transport",
  "accommodation",
  "office_supplies",
  "software",
  "client_entertainment",
  "travel",
  "other",
] as const satisfies readonly MobileReceipt["category"][];

/** Same limit as the server (MAX_AMOUNT in src/lib/receipts/receipt-fields.ts). */
const MAX_AMOUNT = 1_000_000;

/**
 * "245", "245,50", "1 305,50", "1,305.50", "1.305,50" → a positive number
 * with at most two decimals, or null.
 */
export function parseAmount(text: string): number | null {
  let t = text.replace(/[\s  ']/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);
  // A separator followed by 1–2 digits at the end is the decimal mark;
  // any other separator groups thousands.
  if (decimalAt !== -1 && t.length - decimalAt - 1 <= 2) {
    t = t.slice(0, decimalAt).replace(/[.,]/g, "") + "." + t.slice(decimalAt + 1);
  } else {
    t = t.replace(/[.,]/g, "");
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

/** A Date as the plain day the server stores ("2026-11-10"), in local time. */
export function toPlainDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The body for PATCH /api/receipts/[id]; empty means "confirm as it is". */
export type ReceiptPatch = {
  merchant?: string;
  amount?: number;
  currency?: EditableCurrency;
  receipt_date?: string;
  category?: MobileReceipt["category"];
};

/** The row after a saved change, before the server's next full answer. */
export function applyPatch(r: MobileReceipt, patch: ReceiptPatch, status: MobileReceipt["status"]): MobileReceipt {
  const next: MobileReceipt = { ...r, status };
  if (patch.merchant !== undefined) next.merchant = patch.merchant;
  if (patch.amount !== undefined) next.total = patch.amount;
  if (patch.currency !== undefined) next.currency = patch.currency;
  if (patch.receipt_date !== undefined) next.date = patch.receipt_date;
  if (patch.category !== undefined) next.category = patch.category;
  // The server drops a conversion when amount, currency or date change.
  const moved =
    (patch.amount !== undefined && patch.amount !== r.total) ||
    (patch.currency !== undefined && patch.currency !== r.currency) ||
    (patch.receipt_date !== undefined && patch.receipt_date !== r.date);
  if (moved) {
    next.homeTotal = null;
    next.homeCurrency = null;
    next.fxSource = null;
  }
  const missing: MobileReceipt["missing"] = [];
  if (!next.merchant?.trim()) missing.push("merchant");
  if (next.total == null) missing.push("total");
  if (!next.date) missing.push("purchased_at");
  next.missing = missing;
  return next;
}

/** Each edit sheet's height, set by the stack before it opens (no jump). */
export const EDIT_DETENTS: Record<"merchant" | "amount" | "date" | "category" | "all", number[]> = {
  merchant: [0.45],
  amount: [0.5],
  date: [0.75],
  category: [0.75],
  // Every field in one sheet (the receipt screen's Edit).
  all: [1.0],
};
