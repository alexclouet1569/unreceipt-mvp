// SERVER-ONLY. The provider-independent half of the OAuth flow: state,
// PKCE, the browser-binding cookie, the fixed redirect targets and the
// pending-flow rows (mailbox_oauth_pending).
//
//   state          32 random bytes (base64url), the pending row's key.
//   PKCE           S256: verifier 32 random bytes, challenge its sha256.
//   binding cookie a separate random value set HttpOnly on the browser that
//                  starts the flow; the row keeps only its sha256. The
//                  callback must see the same cookie, so a `code`+`state`
//                  pair replayed in another browser is refused.
//
// Where the flow ends is never taken from the request: the website goes to
// /app/settings, the iPhone app to unreceipt://mailboxes.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { absoluteAppUrl } from "@/lib/app-url";
import type { MailboxOAuthPending } from "@/lib/types";
import type { MailboxProviderId } from "./types";

export const PENDING_TTL_MS = 10 * 60 * 1000;
export const APP_RETURN_URL = "unreceipt://mailboxes";
export type OAuthClient = "web" | "app";

const b64url = (bytes: Buffer) => bytes.toString("base64url");
export const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export function newState(): string {
  return b64url(randomBytes(32));
}

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier, "ascii").digest());
  return { verifier, challenge };
}

export function newBindingValue(): string {
  return b64url(randomBytes(32));
}

/**
 * One cookie per flow, named after the state's hash, so two flows started
 * in two tabs don't overwrite each other. Scoped to the callback path.
 */
export function bindingCookieName(state: string): string {
  return `mbx_${sha256Hex(state).slice(0, 16)}`;
}

export const BINDING_COOKIE_PATH = "/api/mailboxes/callback";

export function bindingCookieOptions(maxAgeSeconds = PENDING_TTL_MS / 1000) {
  return {
    httpOnly: true,
    // Browsers treat localhost as secure; only `next dev` over plain http
    // on another host would need it off.
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax" as const,
    path: BINDING_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  };
}

/** Constant-time check of the cookie against the stored hash. */
export function bindingMatches(cookieValue: string | undefined, storedHash: string): boolean {
  if (!cookieValue || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(sha256Hex(cookieValue), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function redirectUri(provider: MailboxProviderId): string {
  return absoluteAppUrl(`/api/mailboxes/callback/${provider}`);
}

// Reasons are short fixed codes; anything else becomes "server_error".
export const RESULT_REASONS = [
  "denied",
  "admin_consent",
  "expired",
  "invalid_state",
  "wrong_browser",
  "wrong_account",
  "exchange_failed",
  // The mail permission was unticked on Google's consent screen.
  "scope_missing",
  "limit",
  "rate_limited",
  "link_invalid",
  "link_expired",
  "link_used",
  "provider_unavailable",
  "server_error",
] as const;
export type ResultReason = (typeof RESULT_REASONS)[number];

/** The first sync after connecting: the last 30 days, at most 100 messages. */
export const BACKFILL = { backfillDays: 30, maxMessages: 100 } as const;

/**
 * The provider's own refusal, as a reason code. Microsoft puts the AADSTS
 * code in error_description: 65001 (consent required), 90094/90095 (admin
 * approval required) mean the user's organisation must approve the app.
 */
export function providerErrorReason(error: string, description: string | null): ResultReason {
  const text = `${error} ${description ?? ""}`;
  if (/AADSTS(65001|90094|90095|90099)\b/.test(text) || /admin[_ ]consent|admin approval|need admin/i.test(text)) {
    return "admin_consent";
  }
  if (error === "consent_required") return "admin_consent";
  if (error === "access_denied") return "denied";
  return "provider_unavailable";
}

/** Where a finished (or failed) flow sends the browser. Fixed targets only. */
export function resultUrl(
  client: OAuthClient,
  outcome: { status: "connected" } | { status: "error"; reason: ResultReason } | { status: "cancelled" },
): string {
  const params = new URLSearchParams();
  if (client === "app") {
    params.set("status", outcome.status);
    if (outcome.status === "error") params.set("reason", outcome.reason);
    return `${APP_RETURN_URL}?${params}`;
  }
  params.set("mailbox", outcome.status === "connected" ? "connected" : outcome.status === "cancelled" ? "cancelled" : "error");
  if (outcome.status === "error") params.set("reason", outcome.reason);
  return absoluteAppUrl(`/app/settings?${params}`);
}

/** "a•••@acme.se": enough to recognise one's own account, not to harvest it. */
export function maskAddress(address: string | null | undefined): string {
  const [local, domain] = (address ?? "").split("@");
  if (!local || !domain) return "your account";
  return `${local[0]}•••@${domain}`;
}

export type NewPending = {
  state: string;
  verifier: string;
  challenge: string;
  bindingValue: string;
  expiresAt: number;
};

/**
 * Stores a pending flow and returns what the route needs to set the cookie
 * and build the consent URL. A reused app link (same jti) fails with
 * { error: "link_used" }.
 */
export async function createPending(
  supabase: SupabaseClient,
  input: { userId: string; provider: MailboxProviderId; client: OAuthClient; linkJti?: string | null },
  now: number = Date.now(),
): Promise<{ ok: true; pending: NewPending } | { ok: false; error: "link_used" | "db" }> {
  const state = newState();
  const { verifier, challenge } = newPkce();
  const bindingValue = newBindingValue();
  const expiresAt = now + PENDING_TTL_MS;
  const { error } = await supabase.from("mailbox_oauth_pending").insert({
    nonce: state,
    user_id: input.userId,
    provider: input.provider,
    code_verifier: verifier,
    client: input.client,
    browser_binding: sha256Hex(bindingValue),
    link_jti: input.linkJti ?? null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) {
    if (error.code === "23505" && input.linkJti) return { ok: false, error: "link_used" };
    return { ok: false, error: "db" };
  }
  return { ok: true, pending: { state, verifier, challenge, bindingValue, expiresAt } };
}

/**
 * Takes the pending row for `state` out of the table (delete … returning),
 * so a state works once even when two callbacks race. Null when unknown.
 */
export async function takePending(
  supabase: SupabaseClient,
  state: string,
): Promise<{ ok: true; row: MailboxOAuthPending | null } | { ok: false }> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return { ok: true, row: null };
  const { data, error } = await supabase
    .from("mailbox_oauth_pending")
    .delete()
    .eq("nonce", state)
    .select("nonce, user_id, provider, code_verifier, client, browser_binding, link_jti, created_at, expires_at");
  if (error) return { ok: false };
  const rows = (data ?? []) as MailboxOAuthPending[];
  return { ok: true, row: rows[0] ?? null };
}

/** Daily cleanup: pending flows past their expiry. */
export async function deleteExpiredPending(
  supabase: SupabaseClient,
  now: number = Date.now(),
): Promise<number> {
  const { data, error } = await supabase
    .from("mailbox_oauth_pending")
    .delete()
    .lt("expires_at", new Date(now).toISOString())
    .select("nonce");
  if (error) throw new Error(`pending cleanup failed (${error.code ?? "unknown"})`);
  return (data ?? []).length;
}
