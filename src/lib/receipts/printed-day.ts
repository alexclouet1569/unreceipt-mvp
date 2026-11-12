// A receipt's day is the date printed on it (AGENTS.md "Insights" → Day
// rule): `receipt_date`, else the date part of `purchased_at`. purchased_at
// holds the receipt's own clock time written with a "Z" (and edits pin it to
// noon of the chosen day), so it is NOT a real UTC instant: shifting it into
// a time zone moves a receipt bought at 23:30 to the next day, and on the
// last evening of a month into the next month, quarter or year.
//
// Pure and client-safe. Every place that sorts receipts into days or months
// (exports, bank matching, firm stats, the ECB rate's day, the list's
// Today / Yesterday) reads it from here; the iPhone app has its own copy
// (mobile/src/lib/format.ts) for its display.

/** Any row with the two date columns (some reads select only these). */
export type DatedRow = { receipt_date?: string | null; purchased_at?: string | null };

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** The "YYYY-MM-DD" a date or timestamp string starts with, unshifted; null otherwise. */
export function dayOf(value: string | null | undefined): string | null {
  const m = value ? DAY.exec(value) : null;
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${y}-${mo}-${d}` : null;
}

/** The printed purchase day, or null when the receipt has no date. */
export function printedDay(r: DatedRow): string | null {
  return dayOf(r.receipt_date) ?? dayOf(r.purchased_at);
}

/** "YYYY-MM" of the printed day, or null. */
export function printedMonth(r: DatedRow): string | null {
  return printedDay(r)?.slice(0, 7) ?? null;
}

/** A printed day as a local calendar date (midnight where the code runs), for "Today" sums. */
export function localDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}
