// GET /api/accounting/fortnox/connect[?org=<organizationId>] — starts
// "Connect Fortnox" for a company (src/lib/accounting/). A plain link from
// Settings (an owner, no ?org) or a client's page in the firm portal (firm
// staff, ?org=<client>): never a form POST, the CSP's form-action 'self'
// would block the redirect to Fortnox.
//
// The user must be an owner of the company or staff of its linked firm
// (resolveOrganization). Then: rate limit, a pending row, an HttpOnly
// binding cookie scoped to the callback, and 303 to Fortnox's consent
// screen, where a system administrator of the Fortnox company approves.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl, fortnoxConfigured } from "@/lib/accounting/fortnox/oauth";
import {
  accountingCookieName,
  accountingCookieOptions,
  createAccountingPending,
  fortnoxResultUrl,
  type FlowTarget,
  type FortnoxResultReason,
} from "@/lib/accounting/oauth";
import { AccountingAccessError, resolveOrganization } from "@/lib/accounting/permissions";
import { noStore } from "@/lib/mailboxes/start-flow";
import { rateLimit } from "@/lib/rate-limit";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) return noStore(NextResponse.redirect(new URL("/app/login", request.url), 303));

  const orgParam = request.nextUrl.searchParams.get("org");
  const fail = (target: FlowTarget | null, reason: FortnoxResultReason) =>
    noStore(NextResponse.redirect(fortnoxResultUrl(target, { status: "error", reason }), 303));

  let resolved;
  try {
    resolved = await resolveOrganization(user.id, orgParam);
  } catch (err) {
    if (!(err instanceof AccountingAccessError)) throw err;
    return fail(null, "server_error");
  }
  if (!resolved) return fail(null, "not_allowed");
  const target: FlowTarget = { actor: resolved.actor.kind, organizationId: resolved.organizationId };

  if (!fortnoxConfigured()) return fail(target, "not_configured");

  const limited = await rateLimit("accountingConnect", user.id);
  if (!limited.ok) return fail(target, "rate_limited");

  const pending = await createAccountingPending(getSupabaseAdmin(), {
    userId: user.id,
    organizationId: resolved.organizationId,
    actor: resolved.actor.kind,
  });
  if (!pending) {
    Sentry.captureMessage("accounting pending insert failed", { tags: { area: "accounting", step: "pending_insert" } });
    return fail(target, "server_error");
  }

  const res = noStore(NextResponse.redirect(authUrl(pending.state, pending.codeChallenge), 303));
  res.cookies.set(accountingCookieName(pending.state), pending.bindingValue, accountingCookieOptions());
  return res;
}
