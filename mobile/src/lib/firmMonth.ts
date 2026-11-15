// Months on the Clients tab, as the server's ?month=YYYY-MM.

import { monthLabel } from "./format";
import type { Locale } from "../i18n/core";

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "November" (or "November 2025" for another year). */
export function monthTitle(month: string, locale: Locale, now: Date = new Date()): string {
  const [y, m] = month.split("-").map(Number);
  // monthLabel() counts months from 0.
  return monthLabel(y, m - 1, locale, now);
}
