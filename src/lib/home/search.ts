// Receipt search and the month filter (pilot feedback 2026-11-19: "type in
// the expense and the receipt pops up"). The website's list
// (GET /api/receipts/search) and the iPhone app's (GET /api/mobile/receipts
// with q, month or year) share this. The matching itself is one SQL function,
// public.search_receipts (supabase/schema.sql, 2026-11-19 block), so typed
// text never goes into a PostgREST filter string. Scoped by user_id like the
// home list, in the same order, paged with the same keyset cursor.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Receipt } from "@/lib/types";
import { OLDER_PAGE_SIZE, type ListCursor } from "./load-home";

/** Longest search text kept; the SQL function cuts at the same length. */
export const SEARCH_MAX_LENGTH = 100;

export type SearchQuery = {
  /** Matched in merchant, note, line items and the card's last four digits. */
  text: string | null;
  /** Matched against the amount as printed or converted. */
  amount: number | null;
};

export type SearchPeriod = { from: string; to: string };

export type ReceiptSearch = SearchQuery & { period: SearchPeriod | null };

// A currency sign or word typed before or after an amount ("49 kr", "€12").
const CURRENCY_BEFORE = /^(?:€|\$|£|sek|eur|usd|gbp|chf|kr\.?)\s*/;
const CURRENCY_AFTER = /\s*(?:kr\.?|:-|sek|nok|dkk|eur|usd|gbp|chf|pln|€|\$|£)$/;

/**
 * The typed amount, or null when the text isn't one. Accepts "49", "49,50",
 * "49.5", "1 234,50", "1.234,50", "1,234.50", with a currency sign or word
 * before or after. A separator followed by exactly three digits groups
 * thousands; one or two digits are decimals.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(CURRENCY_BEFORE, "").replace(CURRENCY_AFTER, "");
  // Spaces only group thousands ("1 234,50").
  if (/\s/.test(s)) {
    if (!/^\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?$/.test(s)) return null;
    s = s.replace(/\s/g, "");
  }
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let normalized = s;
  if (lastSep !== -1) {
    const intPart = s.slice(0, lastSep);
    const decimals = s.length - lastSep - 1;
    if (decimals === 3) {
      // Every separator groups thousands: "1.234", "1,234,567".
      if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) return null;
      normalized = s.replace(/[.,]/g, "");
    } else if (decimals <= 2) {
      // Separators before the decimal one group thousands and are the other kind.
      if (intPart.includes(s[lastSep])) return null;
      if (/[.,]/.test(intPart) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(intPart)) return null;
      normalized = `${intPart.replace(/[.,]/g, "")}.${s.slice(lastSep + 1)}`;
    } else {
      return null;
    }
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value >= 1e10) return null;
  return Math.round(value * 100) / 100;
}

/**
 * What to look for. Null when nothing was typed. The text is always matched
 * (merchant, note, line items, the card's last four digits); when it also
 * reads as an amount, receipts of that amount match too.
 */
export function parseSearchQuery(raw: string | null | undefined): SearchQuery | null {
  if (typeof raw !== "string") return null;
  // Control characters out, whitespace collapsed, length capped.
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);
  if (!text) return null;
  return { text, amount: parseAmount(text) };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The days of `month` (YYYY-MM) or `year` (YYYY). Null when neither is
 * given; "invalid" when one is malformed or out of range. Month wins when
 * both come.
 */
export function parseSearchPeriod(month: string | null, year: string | null): SearchPeriod | null | "invalid" {
  if (month != null && month !== "") {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) return "invalid";
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return "invalid";
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(last)}` };
  }
  if (year != null && year !== "") {
    if (!/^\d{4}$/.test(year)) return "invalid";
    const y = Number(year);
    if (y < 2000 || y > 2100) return "invalid";
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return null;
}

/**
 * The search from a request's `q`, `month` and `year`. Null when it asks for
 * nothing (the plain list), "invalid" for a malformed period.
 */
export function parseReceiptSearch(params: URLSearchParams): ReceiptSearch | null | "invalid" {
  const query = parseSearchQuery(params.get("q"));
  const period = parseSearchPeriod(params.get("month"), params.get("year"));
  if (period === "invalid") return "invalid";
  if (!query && !period) return null;
  return { text: query?.text ?? null, amount: query?.amount ?? null, period };
}

/**
 * One page of the user's receipts that match, after `cursor` (the first
 * page without one), in the home list's order.
 */
export async function searchReceipts(
  userId: string,
  search: ReceiptSearch,
  cursor: ListCursor | null,
): Promise<{ receipts: Receipt[]; hasMore: boolean }> {
  const { data, error } = await getSupabaseAdmin().rpc("search_receipts", {
    p_user_id: userId,
    p_query: search.text,
    p_amount: search.amount,
    p_from: search.period?.from ?? null,
    p_to: search.period?.to ?? null,
    p_after_purchased_at: cursor?.purchasedAt ?? null,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
    // One more than a page, to know whether another follows.
    p_limit: OLDER_PAGE_SIZE + 1,
  });
  if (error) throw new Error(`receipt search ${error.code}`);
  const rows = (Array.isArray(data) ? data : []) as Receipt[];
  return { receipts: rows.slice(0, OLDER_PAGE_SIZE), hasMore: rows.length > OLDER_PAGE_SIZE };
}
