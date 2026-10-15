/**
 * Edit tracking for receipts (launch plan actions 41–42).
 *
 * A customer can correct any receipt. The original file never changes; the
 * extracted data does, and every change to a *factual* field is recorded so
 * the detail view and the PDF can say "Edited by you on <date>" and show the
 * value before. Category and notes are the customer's own annotations, not
 * facts read off the receipt, so changing them isn't marked.
 *
 * Pure — no I/O. PATCH /api/receipts/[id] computes the marker here; the
 * reprocess route uses `edited_fields` to never overwrite a correction.
 */

import { formatAmount, formatDate } from "@/lib/receipt-format";
import type { EditChange, EditHistoryEntry, Receipt, ReceiptItem } from "@/lib/types";

export const TRACKED_EDIT_FIELDS = [
  "merchant_name",
  "total",
  "currency",
  "receipt_date",
  "tax_amount",
  "tax_rate",
  "payment_method",
  "items",
] as const;
export type TrackedEditField = (typeof TRACKED_EDIT_FIELDS)[number];

export const EDIT_FIELD_LABELS: Record<TrackedEditField, string> = {
  merchant_name: "Merchant",
  total: "Total",
  currency: "Currency",
  receipt_date: "Date",
  tax_amount: "VAT amount",
  tax_rate: "VAT rate",
  payment_method: "Payment method",
  items: "Line items",
};

// Enough for any realistic correction trail; keeps the row small.
export const MAX_EDIT_HISTORY = 50;

function isTracked(field: string): field is TrackedEditField {
  return (TRACKED_EDIT_FIELDS as readonly string[]).includes(field);
}

function normalizeItems(items: unknown): ReceiptItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    label: String(it?.label ?? ""),
    qty: it?.qty == null ? null : Number(it.qty),
    unit_amount: it?.unit_amount == null ? null : Number(it.unit_amount),
    total_amount: Number(it?.total_amount ?? 0),
  }));
}

function sameValue(field: TrackedEditField, a: unknown, b: unknown): boolean {
  if (field === "items") {
    return JSON.stringify(normalizeItems(a)) === JSON.stringify(normalizeItems(b));
  }
  if (a == null || b == null) return a == null && b == null;
  if (field === "total" || field === "tax_amount" || field === "tax_rate") {
    // Postgres numeric can come back as "245.50"; compare as numbers.
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

/**
 * The tracked fields that `update` actually changes on `existing`, with
 * their before/after values. Untracked keys in `update` are ignored.
 */
export function diffTrackedFields(
  existing: Partial<Receipt>,
  update: Record<string, unknown>,
): Record<string, EditChange> {
  const changes: Record<string, EditChange> = {};
  for (const [field, to] of Object.entries(update)) {
    if (!isTracked(field)) continue;
    const from = (existing as Record<string, unknown>)[field] ?? null;
    if (!sameValue(field, from, to)) {
      changes[field] = { from, to: to ?? null };
    }
  }
  return changes;
}

/**
 * Columns to add to the update when it changes tracked fields; `{}` when it
 * changes none (e.g. confirming a pending receipt as-is, or only recategorising).
 */
export function editMarker(
  existing: Partial<Receipt>,
  update: Record<string, unknown>,
  now: Date = new Date(),
  by?: string,
): {
  edited_at?: string;
  edited_fields?: string[];
  edit_history?: EditHistoryEntry[];
} {
  const changes = diffTrackedFields(existing, update);
  const fields = Object.keys(changes);
  if (fields.length === 0) return {};

  const at = now.toISOString();
  const previousFields = existing.edited_fields ?? [];
  const history = Array.isArray(existing.edit_history) ? existing.edit_history : [];
  return {
    edited_at: at,
    edited_fields: Array.from(new Set([...previousFields, ...fields])),
    edit_history: capHistory([...history, { at, ...(by ? { by } : {}), changes }]),
  };
}

/**
 * Caps the trail at MAX_EDIT_HISTORY entries but always keeps the first
 * one: it holds the values as originally captured, which the PDF shows.
 */
function capHistory(history: EditHistoryEntry[]): EditHistoryEntry[] {
  if (history.length <= MAX_EDIT_HISTORY) return history;
  return [history[0], ...history.slice(-(MAX_EDIT_HISTORY - 1))];
}

/**
 * "Oct 15, 2026" — the date shown in "Edited by you on …", in Swedish time
 * so a late-evening edit doesn't show as the next day (servers run in UTC).
 */
export function editedOnLabel(receipt: Pick<Receipt, "edited_at">): string | null {
  if (!receipt.edited_at) return null;
  const d = new Date(receipt.edited_at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Europe/Stockholm",
  });
}

/** Human labels of the fields the customer changed, in a stable order. */
export function editedFieldLabels(receipt: Pick<Receipt, "edited_fields">): string[] {
  const fields = receipt.edited_fields ?? [];
  return TRACKED_EDIT_FIELDS.filter((f) => fields.includes(f)).map(
    (f) => EDIT_FIELD_LABELS[f],
  );
}

/**
 * The value each field had before the customer's *first* change to it —
 * i.e. what was originally extracted (or typed at capture). One line per
 * field, e.g. { label: "Total", was: "245.00 kr" }. Fields that were empty
 * before read "empty".
 */
export function originalValues(
  receipt: Pick<Receipt, "edit_history" | "currency">,
): Array<{ label: string; was: string }> {
  const history = Array.isArray(receipt.edit_history) ? receipt.edit_history : [];
  const firstChange = new Map<TrackedEditField, { from: unknown; currency: string }>();
  for (const entry of history) {
    const currencyBefore =
      typeof entry.changes?.currency?.from === "string"
        ? (entry.changes.currency.from as string)
        : receipt.currency;
    for (const [field, change] of Object.entries(entry.changes ?? {})) {
      if (!isTracked(field) || firstChange.has(field)) continue;
      firstChange.set(field, { from: change.from, currency: currencyBefore });
    }
  }
  return TRACKED_EDIT_FIELDS.filter((f) => firstChange.has(f)).map((field) => {
    const { from, currency } = firstChange.get(field)!;
    return { label: EDIT_FIELD_LABELS[field], was: formatWas(field, from, currency) };
  });
}

function formatWas(field: TrackedEditField, value: unknown, currency: string): string {
  if (value == null || value === "") return "empty";
  switch (field) {
    case "total":
    case "tax_amount":
      return formatAmount(Number(value), currency);
    case "tax_rate":
      return `${Number(value)}%`;
    case "receipt_date":
      return formatDate(String(value));
    case "items": {
      const n = Array.isArray(value) ? value.length : 0;
      return n === 0 ? "empty" : `${n} line${n === 1 ? "" : "s"}`;
    }
    default:
      return String(value);
  }
}
