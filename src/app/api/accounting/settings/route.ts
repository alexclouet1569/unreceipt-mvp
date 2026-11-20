// GET   /api/accounting/settings[?org=…] — the company's booking settings
//       and, when Fortnox is connected, the choices read from it: voucher
//       series and the balance-sheet accounts a payment can come from.
// PATCH /api/accounting/settings[?org=…] { voucherSeries, creditAccountCompany,
//       creditAccountEmployee, vatStatus } — saves them. vatStatus says
//       whether the company deducts input VAT ("full" | "none" | "partial"):
//       nothing with VAT is proposed until it is answered. Values are checked against the
//       company's Fortnox when it can be read.
//
// Same rights as connecting (owner, or the linked firm's staff).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fortnoxCaller } from "@/lib/accounting/fortnox/api";
import { loadBookingContext } from "@/lib/accounting/fortnox/context";
import { AccountingAccessError, resolveOrganization } from "@/lib/accounting/permissions";
import { AccountingStoreError, getConnection, getSettings, saveSettings, supabaseTokenStore } from "@/lib/accounting/store";
import { getAccessToken } from "@/lib/accounting/tokens";
import type { BookingContext } from "@/lib/accounting/types";
import { rateLimit } from "@/lib/rate-limit";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import type { AccountingSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const Account = z.string().regex(/^[0-9]{4}$/);
const BodySchema = z.object({
  voucherSeries: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/).nullable(),
  creditAccountCompany: Account.nullable(),
  creditAccountEmployee: Account.nullable(),
  vatStatus: z.enum(["full", "none", "partial"]).nullable(),
});

async function resolve(request: NextRequest) {
  const user = await getServerUser();
  if (!user) return { error: json({ error: "unauthorized" }, 401) } as const;
  try {
    const resolved = await resolveOrganization(user.id, request.nextUrl.searchParams.get("org"));
    if (!resolved) return { error: json({ error: "not_found" }, 404) } as const;
    return { user, ...resolved } as const;
  } catch (err) {
    if (err instanceof AccountingAccessError) return { error: json({ error: "server_error" }, 500) } as const;
    throw err;
  }
}

/** The company's Fortnox context, or null when not connected or unreadable. */
async function contextFor(organizationId: string): Promise<BookingContext | null> {
  const conn = await getConnection(organizationId);
  if (!conn || conn.status !== "active") return null;
  try {
    const token = await getAccessToken(conn.id, { store: supabaseTokenStore() });
    return await loadBookingContext(conn.id, fortnoxCaller(token, conn.id));
  } catch {
    return null;
  }
}

function settingsBody(s: AccountingSettings | null) {
  return {
    voucherSeries: s?.voucher_series ?? null,
    creditAccountCompany: s?.credit_account_company ?? null,
    creditAccountEmployee: s?.credit_account_employee ?? null,
    vatStatus: s?.vat_status ?? null,
  };
}

function paymentAccounts(ctx: BookingContext) {
  // Bank and cash (19xx) and short-term liabilities (24xx–29xx): where a
  // card payment or an employee's outlay is credited.
  return [...ctx.accounts.values()]
    .filter((a) => a.active && /^(19|2[4-9])[0-9]{2}$/.test(a.number))
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((a) => ({ number: a.number, name: a.description }));
}

export async function GET(request: NextRequest) {
  const r = await resolve(request);
  if ("error" in r) return r.error;
  try {
    const [settings, ctx] = await Promise.all([getSettings(r.organizationId), contextFor(r.organizationId)]);
    return json({
      settings: settingsBody(settings),
      options: ctx ? { voucherSeries: ctx.voucherSeries, paymentAccounts: paymentAccounts(ctx) } : null,
    });
  } catch (err) {
    if (err instanceof AccountingStoreError) return json({ error: "server_error" }, 500);
    throw err;
  }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) return json({ error: "forbidden" }, 403);
  const r = await resolve(request);
  if ("error" in r) return r.error;

  const limited = await rateLimit("accountingSettings", r.user.id);
  if (!limited.ok) return json({ error: "rate_limited" }, 429);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const body = parsed.data;

  try {
    const ctx = await contextFor(r.organizationId);
    if (ctx) {
      if (body.voucherSeries && !ctx.voucherSeries.includes(body.voucherSeries)) {
        return json({ error: "unknown_series" }, 422);
      }
      for (const account of [body.creditAccountCompany, body.creditAccountEmployee]) {
        if (account && ctx.accounts.get(account)?.active !== true) return json({ error: "unknown_account", account }, 422);
      }
    }
    const saved = await saveSettings(r.organizationId, r.user.id, {
      voucher_series: body.voucherSeries,
      credit_account_company: body.creditAccountCompany,
      credit_account_employee: body.creditAccountEmployee,
      vat_status: body.vatStatus,
    });
    return json({ settings: settingsBody(saved) });
  } catch (err) {
    if (err instanceof AccountingStoreError) return json({ error: "server_error" }, 500);
    throw err;
  }
}
