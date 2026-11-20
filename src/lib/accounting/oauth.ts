// SERVER-ONLY. The flow around Fortnox's consent screen: pending rows
// (accounting_oauth_pending), the binding cookie and the fixed pages a flow
// ends on. Where it ends is never taken from the request: an owner goes to
// /app/settings, firm staff to the client's page /firm/clients/<orgId>
// (the organisation id comes from the pending row, written by the server).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { absoluteAppUrl } from "@/lib/app-url";
import {
  bindingCookieNameFor,
  bindingCookieOptionsFor,
  isWellFormedState,
  newBindingValue,
  newPkce,
  newState,
  sha256Hex,
} from "@/lib/oauth/flow";
import type { AccountingOAuthPending } from "@/lib/types";

export const ACCOUNTING_PENDING_TTL_MS = 10 * 60 * 1000;
export const ACCOUNTING_CALLBACK_PATH = "/api/accounting/fortnox/callback";

export const FORTNOX_RESULT_REASONS = [
  "denied",
  "expired",
  "invalid_state",
  "wrong_browser",
  "wrong_account",
  "not_allowed",
  "not_configured",
  "exchange_failed",
  "scope_missing",
  "wrong_company",
  "company_taken",
  "no_tenant",
  "rate_limited",
  "provider_unavailable",
  "server_error",
] as const;
export type FortnoxResultReason = (typeof FORTNOX_RESULT_REASONS)[number];

export function accountingCookieName(state: string): string {
  return bindingCookieNameFor("acc", state);
}

export function accountingCookieOptions(maxAgeSeconds = ACCOUNTING_PENDING_TTL_MS / 1000) {
  return bindingCookieOptionsFor(ACCOUNTING_CALLBACK_PATH, maxAgeSeconds);
}

export type FlowTarget = { actor: "owner" | "firm"; organizationId: string };

/** The fixed page a flow ends on. */
export function fortnoxResultUrl(
  target: FlowTarget | null,
  outcome: { status: "connected" } | { status: "error"; reason: FortnoxResultReason },
): string {
  const params = new URLSearchParams({ fortnox: outcome.status === "connected" ? "connected" : "error" });
  if (outcome.status === "error") params.set("reason", outcome.reason);
  if (target?.actor === "firm") return absoluteAppUrl(`/firm/clients/${target.organizationId}?${params}`);
  return absoluteAppUrl(`/app/settings?${params}`);
}

export async function createAccountingPending(
  supabase: SupabaseClient,
  input: { userId: string; organizationId: string; actor: "owner" | "firm" },
  now: number = Date.now(),
): Promise<{ state: string; bindingValue: string; codeChallenge: string } | null> {
  const state = newState();
  const bindingValue = newBindingValue();
  const { verifier, challenge } = newPkce();
  const { error } = await supabase.from("accounting_oauth_pending").insert({
    nonce: state,
    user_id: input.userId,
    organization_id: input.organizationId,
    provider: "fortnox",
    actor: input.actor,
    code_verifier: verifier,
    browser_binding: sha256Hex(bindingValue),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ACCOUNTING_PENDING_TTL_MS).toISOString(),
  });
  if (error) return null;
  return { state, bindingValue, codeChallenge: challenge };
}

/** Takes the row out (delete … returning): a state works once. */
export async function takeAccountingPending(
  supabase: SupabaseClient,
  state: string,
): Promise<{ ok: true; row: AccountingOAuthPending | null } | { ok: false }> {
  if (!isWellFormedState(state)) return { ok: true, row: null };
  const { data, error } = await supabase
    .from("accounting_oauth_pending")
    .delete()
    .eq("nonce", state)
    .select("nonce, user_id, organization_id, provider, actor, code_verifier, browser_binding, created_at, expires_at");
  if (error) return { ok: false };
  return { ok: true, row: ((data ?? []) as AccountingOAuthPending[])[0] ?? null };
}

export async function deleteExpiredAccountingPending(supabase: SupabaseClient, now: number = Date.now()): Promise<number> {
  const { data, error } = await supabase
    .from("accounting_oauth_pending")
    .delete()
    .lt("expires_at", new Date(now).toISOString())
    .select("nonce");
  if (error) throw new Error(`accounting pending cleanup failed (${error.code ?? "unknown"})`);
  return (data ?? []).length;
}

/** Org numbers compared by digits only ("556677-8899" = "5566778899"). */
export function sameOrgNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = (a ?? "").replace(/\D/g, "");
  const db = (b ?? "").replace(/\D/g, "");
  return da.length > 0 && da === db;
}
