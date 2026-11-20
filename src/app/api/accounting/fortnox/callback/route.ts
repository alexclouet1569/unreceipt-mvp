// GET /api/accounting/fortnox/callback — where Fortnox's consent screen
// sends the browser back (?code&state, or ?error). Registered as the
// integration's redirect URI in Fortnox's Developer Portal.
//
// In order: take the pending row (single use); refuse an expired one, one
// started in another browser (binding cookie) or by another signed-in user;
// re-check that the user may still act for the company; then exchange the
// code, read the Fortnox company's name and org number, and refuse a Fortnox
// company whose org number differs from one UnReceipt knows (the company's
// own, or the one the firm typed for the client: a firm admin can reach many
// clients' Fortnox, the wrong one is an easy mistake). Only then save the
// connection (only the company's TenantId: service account, no token is
// stored): confirmed when a known number matched, otherwise
// waiting for a person to confirm the company (PATCH /api/accounting/fortnox).
// A refused connect never revokes anything: with a service account there is
// one consent per Fortnox company for the whole integration, which another
// UnReceipt company may be using; the company ends it in Fortnox →
// Integrationer. Never logs the code or tokens.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { fortnoxCaller } from "@/lib/accounting/fortnox/api";
import { forgetContext, readCompany, readTenantId } from "@/lib/accounting/fortnox/context";
import { clientCredentialsToken, exchangeCode, FortnoxOAuthError, tenantIdFromToken } from "@/lib/accounting/fortnox/oauth";
import {
  accountingCookieName,
  accountingCookieOptions,
  fortnoxResultUrl,
  sameOrgNumber,
  takeAccountingPending,
  type FlowTarget,
  type FortnoxResultReason,
} from "@/lib/accounting/oauth";
import { AccountingAccessError, organizationActor } from "@/lib/accounting/permissions";
import { getConnection, saveConnection, TenantTakenError } from "@/lib/accounting/store";
import { forgetAccessToken } from "@/lib/accounting/tokens";
import { bindingMatches } from "@/lib/oauth/flow";
import { noStore } from "@/lib/mailboxes/start-flow";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const state = search.get("state") ?? "";
  const cookieName = state ? accountingCookieName(state) : null;

  const finish = (target: FlowTarget | null, outcome: Parameters<typeof fortnoxResultUrl>[1]) => {
    const res = noStore(NextResponse.redirect(fortnoxResultUrl(target, outcome), 303));
    if (cookieName) res.cookies.set(cookieName, "", accountingCookieOptions(0));
    return res;
  };
  const fail = (target: FlowTarget | null, reason: FortnoxResultReason) => finish(target, { status: "error", reason });

  const supabase = getSupabaseAdmin();
  const taken = await takeAccountingPending(supabase, state);
  if (!taken.ok) return fail(null, "server_error");
  const pending = taken.row;
  if (!pending) return fail(null, "invalid_state");
  const target: FlowTarget = { actor: pending.actor, organizationId: pending.organization_id };

  if (Date.parse(pending.expires_at) <= Date.now()) return fail(target, "expired");
  if (!bindingMatches(request.cookies.get(cookieName!)?.value, pending.browser_binding)) return fail(target, "wrong_browser");
  const user = await getServerUser();
  if (!user || user.id !== pending.user_id) return fail(target, "wrong_account");

  try {
    const actor = await organizationActor(user.id, pending.organization_id);
    if (!actor) return fail(target, "not_allowed");
  } catch (err) {
    if (err instanceof AccountingAccessError) return fail(target, "server_error");
    throw err;
  }

  if (search.get("error")) return fail(target, search.get("error") === "access_denied" ? "denied" : "provider_unavailable");
  const code = search.get("code");
  if (!code || code.length > 4096) return fail(target, "exchange_failed");

  let tokens;
  try {
    tokens = await exchangeCode(code, pending.code_verifier);
  } catch (err) {
    if (err instanceof FortnoxOAuthError && err.code === "scope_missing") return fail(target, "scope_missing");
    if (err instanceof FortnoxOAuthError && err.code === "unavailable") return fail(target, "provider_unavailable");
    Sentry.captureException(err, { tags: { area: "accounting", step: "exchange" } });
    return fail(target, "exchange_failed");
  }

  // Which Fortnox company: its name and org number, and its TenantId (from
  // the token, else from the company settings). Only the TenantId is kept:
  // later tokens come from the client credentials + it.
  let company: { name: string | null; orgNumber: string | null };
  let tenantId: string | null;
  try {
    const call = fortnoxCaller(tokens.accessToken, `new:${pending.organization_id}`);
    company = await readCompany(call);
    tenantId = tenantIdFromToken(tokens.accessToken) ?? (await readTenantId(call));
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "accounting", step: "company_info" } });
    return fail(target, "provider_unavailable");
  }
  if (!tenantId) {
    Sentry.captureMessage("fortnox: no tenant id after connect", { tags: { area: "accounting", step: "tenant_id" } });
    return fail(target, "no_tenant");
  }

  // Prove the stored TenantId is the one that works: a client-credentials
  // token for it must reach the very same company (org number and name).
  // Also catches an integration whose service account isn't switched on.
  try {
    const check = await clientCredentialsToken(tenantId);
    const seen = await readCompany(fortnoxCaller(check.accessToken, `check:${pending.organization_id}`));
    if (seen.orgNumber !== company.orgNumber || seen.name !== company.name) {
      Sentry.captureMessage("fortnox: tenant id reaches another company", { tags: { area: "accounting", step: "tenant_check" } });
      return fail(target, "no_tenant");
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "accounting", step: "tenant_check" } });
    return fail(target, err instanceof FortnoxOAuthError && err.code === "unavailable" ? "provider_unavailable" : "no_tenant");
  }

  // The org numbers UnReceipt knows for this company: its own, and the one
  // the firm typed when it added the client. Any of them differing from the
  // Fortnox company's is refused; one matching confirms the connection;
  // none known leaves it unconfirmed until a person confirms "book into
  // <company> (<org number>)" (nothing is posted before).
  const [{ data: org, error: orgError }, { data: links, error: linkError }] = await Promise.all([
    supabase.from("organizations").select("org_number").eq("id", pending.organization_id).maybeSingle(),
    supabase.from("firm_clients").select("client_org_number").eq("organization_id", pending.organization_id).eq("status", "active"),
  ]);
  if (orgError || linkError) {
    return fail(target, "server_error");
  }
  const known = [org?.org_number as string | null | undefined, ...(links ?? []).map((l) => l.client_org_number as string | null)]
    .map((n) => (n ?? "").replace(/\D/g, ""))
    .filter((n) => n.length > 0);
  if (known.length > 0 && (!company.orgNumber || known.some((n) => !sameOrgNumber(n, company.orgNumber)))) {
    return fail(target, "wrong_company");
  }
  const confirmed = known.length > 0;

  try {
    const previous = await getConnection(pending.organization_id);
    await saveConnection({
      organizationId: pending.organization_id,
      userId: user.id,
      tenantId,
      companyName: company.name,
      companyOrgNumber: company.orgNumber,
      confirmed,
    });
    if (previous) {
      forgetContext(previous.id);
      forgetAccessToken(previous.id);
    }
  } catch (err) {
    // That Fortnox company already books for another UnReceipt company.
    if (err instanceof TenantTakenError) return fail(target, "company_taken");
    Sentry.captureException(err, { tags: { area: "accounting", step: "save_connection" } });
    return fail(target, "server_error");
  }
  return finish(target, { status: "connected" });
}
