// SERVER-ONLY. What the agent reads from a company's Fortnox before it
// proposes: active accounts, financial years, voucher series, the locked
// period, and the company's name and org number (shown when connecting).
// Cached per connection on this instance for 10 minutes: a chart of
// accounts rarely changes, and a stale cache can only make the agent refuse
// (an account it thinks inactive) or Fortnox refuse the voucher (a period
// locked meanwhile), never post something wrong.

import "server-only";

import type { BookingContext, FinancialYear, FortnoxAccount } from "../types";
import type { FortnoxCaller } from "./api";

const TTL_MS = 10 * 60 * 1000;
const PAGE_LIMIT = 500;
const MAX_PAGES = 10;

type AccountsPage = {
  Accounts?: Array<{ Number?: number | string; Description?: string; Active?: boolean }>;
  MetaInformation?: { "@TotalPages"?: number; "@CurrentPage"?: number };
};

const cache = new Map<string, { at: number; value: BookingContext }>();

export function _resetContextCacheForTests(): void {
  cache.clear();
}

export function forgetContext(connectionId: string): void {
  cache.delete(connectionId);
}

function isoDay(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function readAccounts(call: FortnoxCaller): Promise<Map<string, FortnoxAccount>> {
  const accounts = new Map<string, FortnoxAccount>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await call<AccountsPage>({ method: "GET", path: "/accounts", query: { page, limit: PAGE_LIMIT } });
    for (const a of res.Accounts ?? []) {
      const number = String(a.Number ?? "");
      if (!/^[0-9]{4}$/.test(number)) continue;
      accounts.set(number, { number, description: String(a.Description ?? "").slice(0, 120), active: a.Active !== false });
    }
    const total = Number(res.MetaInformation?.["@TotalPages"] ?? 1);
    if (!Number.isFinite(total) || page >= total) break;
  }
  return accounts;
}

export async function readFinancialYears(call: FortnoxCaller): Promise<FinancialYear[]> {
  const res = await call<{ FinancialYears?: Array<{ Id?: number; FromDate?: string; ToDate?: string }> }>({
    method: "GET",
    path: "/financialyears",
  });
  return (res.FinancialYears ?? [])
    .map((y) => ({ id: Number(y.Id), from: isoDay(y.FromDate), to: isoDay(y.ToDate) }))
    .filter((y): y is FinancialYear => Number.isInteger(y.id) && y.from !== null && y.to !== null);
}

export async function readVoucherSeries(call: FortnoxCaller): Promise<string[]> {
  const res = await call<{ VoucherSeriesCollection?: Array<{ Code?: string; Inactive?: boolean }> }>({
    method: "GET",
    path: "/voucherseries",
  });
  return (res.VoucherSeriesCollection ?? [])
    .filter((s) => s.Inactive !== true && typeof s.Code === "string")
    .map((s) => String(s.Code).toUpperCase());
}

export async function readLockedThrough(call: FortnoxCaller): Promise<string | null> {
  const res = await call<{ LockedPeriod?: { EndDate?: string } }>({ method: "GET", path: "/settings/lockedperiod" });
  return isoDay(res.LockedPeriod?.EndDate);
}

export async function readCompany(call: FortnoxCaller): Promise<{ name: string | null; orgNumber: string | null }> {
  const res = await call<{ CompanyInformation?: { CompanyName?: string; OrganizationNumber?: string } }>({
    method: "GET",
    path: "/companyinformation",
  });
  const name = res.CompanyInformation?.CompanyName?.trim().slice(0, 200) || null;
  const org = res.CompanyInformation?.OrganizationNumber?.trim() ?? "";
  return { name, orgNumber: /^[0-9-]{6,20}$/.test(org) ? org : null };
}

export async function loadBookingContext(
  connectionId: string,
  call: FortnoxCaller,
  now: number = Date.now(),
): Promise<BookingContext> {
  const hit = cache.get(connectionId);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const [accounts, financialYears, voucherSeries, lockedThrough] = await Promise.all([
    readAccounts(call),
    readFinancialYears(call),
    readVoucherSeries(call),
    readLockedThrough(call),
  ]);
  const value: BookingContext = { accounts, financialYears, voucherSeries, lockedThrough };
  cache.set(connectionId, { at: now, value });
  return value;
}
