// Which periods the export screen offers: every month from now back to the
// first receipt (at least a year, at most ten), the years they span, and
// everything. Same range as the website's ExportPanel (exportPeriods). Pure,
// so it's tested.

import type { Locale } from "../i18n/core";
import { monthLabel } from "./format";

export type ExportPeriod = { key: string; label: string };

export function exportPeriods(
  firstMonth: string | null,
  locale: Locale,
  now: Date = new Date(),
): { months: ExportPeriod[]; years: ExportPeriod[] } {
  let count = 12;
  const m = firstMonth ? /^(\d{4})-(\d{2})$/.exec(firstMonth) : null;
  if (m) {
    const span = (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() - (Number(m[2]) - 1)) + 1;
    count = Math.min(120, Math.max(12, span));
  }
  const months: ExportPeriod[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: monthLabel(d.getFullYear(), d.getMonth(), locale, now) });
  }
  const years = [...new Set(months.map((p) => p.key.slice(0, 4)))].map((y) => ({ key: y, label: y }));
  return { months, years };
}
