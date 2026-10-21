/**
 * Expense claims (notes de frais). Pure — safe to import from any layer.
 *
 * Someone reimbursed by their employer has to copy every receipt into the
 * employer's expense system: date, place, purpose, expense type, amount.
 * This module works out as much of that as the receipt itself tells us, so
 * the person only checks it on /app/claims:
 *
 * - type: from the category, the time printed on the receipt (lunch vs
 *   dinner) and the merchant name (parking, tolls, fuel, taxi);
 * - place: the town in the merchant's address, or another receipt of the
 *   same day;
 * - purpose: another receipt of the same day, or the last purpose used for
 *   the same place.
 *
 * Anything the person saved (claim_type / claim_place / claim_purpose)
 * always wins over a suggestion. A wrong guess is worse than a blank, so
 * when nothing points at a value it stays empty.
 */

import type { ClaimType, Receipt } from "@/lib/types";
import { getMessages } from "@/lib/i18n/messages";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/locale";

/** Every claim type, in the order the form and the totals show them. */
export const CLAIM_TYPE_KEYS: [ClaimType, ...ClaimType[]] = [
  "lunch",
  "dinner",
  "overnight",
  "train",
  "parking",
  "toll",
  "fuel",
  "taxi",
  "other",
];

export const MAX_CLAIM_PLACE = 100;
export const MAX_CLAIM_PURPOSE = 200;

export function claimTypeLabel(key: ClaimType, locale: Locale = "en"): string {
  const types = getMessages(locale).claims.types;
  return types[key] ?? types.other;
}

export type ClaimReceipt = Pick<
  Receipt,
  | "id"
  | "merchant_name"
  | "merchant_address"
  | "category"
  | "currency"
  | "total"
  | "receipt_date"
  | "receipt_time"
  | "purchased_at"
  | "status"
  | "items"
  | "claim_place"
  | "claim_purpose"
  | "claim_type"
>;

// A purpose the person saved earlier, used to suggest one for the same place.
export type PurposeHistoryEntry = Pick<
  Receipt,
  "claim_place" | "claim_purpose" | "purchased_at" | "receipt_date"
>;

export interface ClaimLine {
  receipt: ClaimReceipt;
  /** 1-based, in date order: the number written on the stapled original. */
  number: number;
  /** YYYY-MM-DD, or "" when the receipt has no date. */
  date: string;
  /** HH:MM, or null when the receipt shows no time. */
  time: string | null;
  type: ClaimType;
  place: string;
  purpose: string;
  /** Which values are suggestions the person hasn't confirmed yet. */
  suggested: { type: boolean; place: boolean; purpose: boolean };
  /** Receipts still in review can't go on a claim until they're checked. */
  ready: boolean;
}

/** The purchase day as YYYY-MM-DD (UTC: capture pins purchased_at to noon UTC). */
export function claimDate(r: Pick<Receipt, "purchased_at" | "receipt_date">): string {
  if (r.receipt_date && /^\d{4}-\d{2}-\d{2}/.test(r.receipt_date)) {
    return r.receipt_date.slice(0, 10);
  }
  if (r.purchased_at && /^\d{4}-\d{2}-\d{2}/.test(r.purchased_at)) {
    return r.purchased_at.slice(0, 10);
  }
  return "";
}

/** "12:41:00" or "12:41" → "12:41"; anything else → null. */
export function claimTime(value: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// Restaurants that print the time: before 16:00 is lunch, after is dinner.
// Without a time, lunch: it's by far the most common meal on a claim.
const DINNER_FROM_HOUR = 16;

const MERCHANT_TYPES: Array<{ type: ClaimType; pattern: RegExp }> = [
  { type: "parking", pattern: /\b(parking|parkings|stationnement|indigo|effia|saemes|onepark|zenpark|parkeringen|easypark|parkering)\b/i },
  { type: "toll", pattern: /\b(p[ée]age|autoroutes?|vinci autoroutes|aprr|sanef|asf|cofiroute|escota|bropass)\b/i },
  { type: "fuel", pattern: /\b(carburants?|gazole|diesel|essence|sp95|sp98|e10|totalenergies|esso|shell|avia|circle k|preem|okq8|ingo|st1|bp)\b/i },
  { type: "taxi", pattern: /\b(taxis?|uber|g7|bolt|heetch|vtc)\b/i },
  { type: "train", pattern: /\b(sncf|ouigo|tgv|ter|intercit[ée]s|trainline|sj|thalys|eurostar)\b/i },
];

/** The claim type the receipt itself points at. */
export function inferClaimType(r: Pick<ClaimReceipt, "category" | "receipt_time" | "merchant_name" | "items">): ClaimType {
  if (r.category === "meals" || r.category === "client_entertainment") {
    const time = claimTime(r.receipt_time);
    if (time && Number(time.slice(0, 2)) >= DINNER_FROM_HOUR) return "dinner";
    return "lunch";
  }
  if (r.category === "accommodation") return "overnight";
  // Office supplies or software are never parking or fuel, whatever a line
  // label says ("Essence de vanille").
  if (r.category !== "transport" && r.category !== "travel" && r.category !== "other") {
    return "other";
  }

  const text = [r.merchant_name ?? "", ...(r.items ?? []).map((i) => i.label)].join(" ");
  for (const { type, pattern } of MERCHANT_TYPES) {
    if (pattern.test(text)) return type;
  }
  if (r.category === "travel") return "train";
  return "other";
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * The town in a merchant address, from the postcode that precedes it:
 * French "63100 CLERMONT-FERRAND", Swedish "114 55 Stockholm".
 */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = /\b(?:\d{5}|\d{3} \d{2})\s+([\p{L}][\p{L}'’ -]*)/u.exec(address);
  if (!m) return null;
  const city = m[1]
    .replace(/\bcedex\b.*$/i, "")
    .replace(/[\s-]+$/, "")
    .trim();
  if (city.length < 2) return null;
  return titleCase(city).slice(0, MAX_CLAIM_PLACE);
}

function placeKey(place: string): string {
  return place
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nonEmpty(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/**
 * One line per receipt of the period, numbered in date order, with every
 * value filled from what was saved or, failing that, suggested.
 */
export function buildClaimLines(
  receipts: readonly ClaimReceipt[],
  history: readonly PurposeHistoryEntry[] = [],
): ClaimLine[] {
  const sorted = [...receipts].sort((a, b) => {
    const da = claimDate(a);
    const db = claimDate(b);
    if (da !== db) return da < db ? -1 : 1;
    const ta = claimTime(a.receipt_time) ?? "";
    const tb = claimTime(b.receipt_time) ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  // What the person already said about each day of this period.
  const dayPlace = new Map<string, string>();
  const dayPurpose = new Map<string, string>();
  for (const r of sorted) {
    const day = claimDate(r);
    if (!day) continue;
    const place = nonEmpty(r.claim_place);
    const purpose = nonEmpty(r.claim_purpose);
    if (place && !dayPlace.has(day)) dayPlace.set(day, place);
    if (purpose && !dayPurpose.has(day)) dayPurpose.set(day, purpose);
  }

  // Latest purpose saved for each place, across all of the person's receipts.
  const placePurpose = new Map<string, { purpose: string; date: string }>();
  for (const h of [...history, ...sorted]) {
    const place = nonEmpty(h.claim_place);
    const purpose = nonEmpty(h.claim_purpose);
    if (!place || !purpose) continue;
    const key = placeKey(place);
    const date = claimDate(h);
    const seen = placePurpose.get(key);
    if (!seen || date > seen.date) placePurpose.set(key, { purpose, date });
  }

  return sorted.map((r, i) => {
    const day = claimDate(r);
    const savedPlace = nonEmpty(r.claim_place);
    const place =
      savedPlace ?? cityFromAddress(r.merchant_address) ?? (day ? dayPlace.get(day) : undefined) ?? "";
    const savedPurpose = nonEmpty(r.claim_purpose);
    const purpose =
      savedPurpose ??
      (day ? dayPurpose.get(day) : undefined) ??
      (place ? placePurpose.get(placeKey(place))?.purpose : undefined) ??
      "";
    return {
      receipt: r,
      number: i + 1,
      date: day,
      time: claimTime(r.receipt_time),
      type: r.claim_type ?? inferClaimType(r),
      place,
      purpose,
      suggested: {
        type: r.claim_type == null,
        place: savedPlace == null && place !== "",
        purpose: savedPurpose == null && purpose !== "",
      },
      ready: r.status !== "pending_review",
    };
  });
}

export interface ClaimTotal {
  type: ClaimType;
  currency: string;
  count: number;
  amount: number;
}

/**
 * Count and amount per expense type and currency, over the lines that are
 * ready, in CLAIM_TYPE_KEYS order. Amounts in different currencies are never
 * added together.
 */
export function claimTotals(lines: readonly ClaimLine[]): {
  byType: ClaimTotal[];
  byCurrency: Array<{ currency: string; amount: number; count: number }>;
} {
  const byType = new Map<string, ClaimTotal>();
  const byCurrency = new Map<string, { currency: string; amount: number; count: number }>();
  for (const line of lines) {
    if (!line.ready || line.receipt.total == null) continue;
    const amount = Number(line.receipt.total);
    if (!Number.isFinite(amount)) continue;
    const currency = line.receipt.currency;
    const key = `${line.type}:${currency}`;
    const t = byType.get(key) ?? { type: line.type, currency, count: 0, amount: 0 };
    t.count += 1;
    t.amount = round2(t.amount + amount);
    byType.set(key, t);
    const c = byCurrency.get(currency) ?? { currency, amount: 0, count: 0 };
    c.count += 1;
    c.amount = round2(c.amount + amount);
    byCurrency.set(currency, c);
  }
  const order = CLAIM_TYPE_KEYS;
  return {
    byType: [...byType.values()].sort(
      (a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.currency.localeCompare(b.currency),
    ),
    byCurrency: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "2026-05" when valid (2000–2100), else null. Strict: it ends up in a query. */
export function parseClaimMonth(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(input);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return input;
}

/** The month `delta` months away from "YYYY-MM". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "2026-05" → "May 2026" / "Mai 2026" / "Maj 2026". */
export function claimMonthLabel(month: string, locale: Locale = "en"): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(INTL_LOCALE[locale], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  // French and Swedish month names are lowercase; this is a title.
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "2026-05-06" → "Wed, May 6" / "mer. 6 mai" / "ons 6 maj". */
export function claimDayLabel(date: string, locale: Locale = "en"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return getMessages(locale).common.noDate;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(INTL_LOCALE[locale], {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
