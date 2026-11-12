// Pure helpers for the firm portal's client list: per-client counts for a
// month from a flat list of receipt rows. No I/O so it's trivially tested.

import { printedMonth } from "@/lib/receipts/printed-day";

export interface StatRow {
  organization_id: string | null;
  status: "verified" | "pending_review" | string;
  exported_at: string | null;
  created_at: string;
  purchased_at: string | null;
  receipt_date?: string | null;
}

export interface ClientStats {
  // Receipts printed in the month (receipt_date, else purchased_at's date,
  // never shifted); a receipt still without a date in the month it arrived.
  total: number;
  reviewNeeded: number;
  ready: number;
  exported: number;
  // Receipts the firm hasn't seen yet: created in the last 7 days.
  newThisWeek: number;
  lastReceiptAt: string | null;
}

export const EMPTY_STATS: ClientStats = {
  total: 0,
  reviewNeeded: 0,
  ready: 0,
  exported: 0,
  newThisWeek: 0,
  lastReceiptAt: null,
};

/** "YYYY-MM" in Europe/Stockholm for a timestamp. */
export function monthKey(iso: string, timeZone = "Europe/Stockholm"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  return `${y}-${m}`;
}

/** The current month as "YYYY-MM", or `requested` when it is valid. */
export function resolveMonth(requested: string | undefined, now = new Date()): string {
  if (requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)) return requested;
  return monthKey(now.toISOString());
}

/**
 * The month a receipt belongs to: its printed month (src/lib/receipts/
 * printed-day.ts), never shifted into Stockholm time (that moved a receipt
 * bought at 23:30 on the 31st into the next month). A receipt still waiting
 * for a date is listed in the month it arrived (created_at is a real instant,
 * read in Stockholm), so the accountant sees it to complete it.
 */
export function receiptMonth(row: Pick<StatRow, "purchased_at" | "receipt_date" | "created_at">): string {
  return printedMonth(row) ?? monthKey(row.created_at);
}

export function computeClientStats(
  rows: StatRow[],
  month: string,
  now = new Date()
): Map<string, ClientStats> {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const out = new Map<string, ClientStats>();
  for (const row of rows) {
    if (!row.organization_id) continue;
    const stats = out.get(row.organization_id) ?? { ...EMPTY_STATS };
    const createdMs = Date.parse(row.created_at);
    if (!Number.isNaN(createdMs)) {
      if (createdMs >= weekAgo) stats.newThisWeek += 1;
      if (!stats.lastReceiptAt || createdMs > Date.parse(stats.lastReceiptAt)) {
        stats.lastReceiptAt = row.created_at;
      }
    }
    if (receiptMonth(row) === month) {
      stats.total += 1;
      if (row.status === "pending_review") stats.reviewNeeded += 1;
      else if (row.exported_at) stats.exported += 1;
      else stats.ready += 1;
    }
    out.set(row.organization_id, stats);
  }
  return out;
}

/**
 * A PostgREST or() filter for receipts printed in a "YYYY-MM" month (the
 * same rule as the export, src/lib/export/build-export.ts): receipt_date in
 * the month, else purchased_at (the receipt's clock written with a "Z") in
 * it. `month` must already be checked (resolveMonth()).
 */
export function printedMonthFilter(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return (
    `and(receipt_date.gte.${start},receipt_date.lt.${end}),` +
    `and(receipt_date.is.null,purchased_at.gte.${start}T00:00:00Z,purchased_at.lt.${end}T00:00:00Z)`
  );
}

/** The first and last instant of a "YYYY-MM" month, as ISO strings (UTC). */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  // One day of slack on each side so Stockholm-local months are covered;
  // computeClientStats() does the exact month check.
  const from = new Date(Date.UTC(y, m - 1, 1) - 24 * 60 * 60 * 1000);
  const to = new Date(Date.UTC(y, m, 1) + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Previous and next "YYYY-MM". */
export function adjacentMonths(month: string): { prev: string; next: string } {
  const [y, m] = month.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return { prev: fmt(prev), next: fmt(next) };
}

/** "November 2026" for "2026-11". */
export function monthLabel(month: string, locale = "en-GB"): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
