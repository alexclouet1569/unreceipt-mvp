// "Connect Gmail / Outlook" in the app: the plain logic, no React Native,
// so it's tested in Node (mailboxes.test.ts).
//
// The flow (src/app/api/mailboxes/**):
//   1. POST /api/mailboxes/connect-link { provider } → a 5-minute https link.
//   2. That link opens in the system sign-in sheet (ASWebAuthenticationSession):
//      our confirmation page, then Google's or Microsoft's consent screen.
//   3. The callback ends at unreceipt://mailboxes?status=… The sheet hands
//      that URL back (openAuthSessionAsync's "success"); if it ever reaches
//      the app as a plain deep link instead, src/app/+native-intent.tsx puts
//      it in the inbox below and the provider picks it up.
//   4. status=claim: the app posts the one-time code to /api/mailboxes/claim
//      with its own sign-in. Only a 200 there means the mailbox is connected.
//
// Every refusal is shown in the app's language from a fixed key, never the
// server's English text.

import type { MobileMailboxClaim, MobileMailboxConnection } from "@/lib/mobile/types";
import type { Locale } from "../i18n/core";
import { fill } from "../i18n/core";
import type { Strings } from "../i18n/en";
import { ApiError } from "./api-error";
import { shortDate } from "./format";

export type MailboxProvider = MobileMailboxConnection["provider"];

/** Gmail first: most customers are on Gmail / Workspace (same order as the website). */
export const PROVIDER_ORDER: readonly MailboxProvider[] = ["google", "microsoft"];

/** The scheme and host the callback sends the app to (APP_RETURN_URL on the server). */
export const RETURN_URL = "unreceipt://mailboxes";

export function configuredProviders(providers: Record<MailboxProvider, boolean> | null | undefined): MailboxProvider[] {
  return providers ? PROVIDER_ORDER.filter((p) => providers[p] === true) : [];
}

// ── The redirect back to the app ─────────────────────────────────────────

export type MailboxOutcome =
  | { kind: "claim"; code: string; provider: MailboxProvider | null }
  | { kind: "connected" }
  | { kind: "cancelled" }
  | { kind: "error"; reason: string };

const RESULT_URL = /^(?:unreceipt:\/\/\/?|\/)mailboxes\/?(?:\?([^#]*))?(?:#.*)?$/i;
// The parked grant's code: 32 random bytes in base64url (43 characters).
const CODE = /^[A-Za-z0-9_-]{16,128}$/;
const REASON = /^[a-z_]{1,40}$/;

function queryParams(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawValue = eq === -1 ? "" : part.slice(eq + 1);
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      // The first value wins: a repeated parameter never overrides it.
      if (!params.has(key)) params.set(key, decodeURIComponent(rawValue.replace(/\+/g, " ")));
    } catch {
      // A malformed escape: that parameter is ignored.
    }
  }
  return params;
}

/**
 * unreceipt://mailboxes?status=… as an outcome, or null when the URL is
 * something else (any other deep link goes on to the router untouched).
 */
export function parseMailboxUrl(url: string): MailboxOutcome | null {
  const m = RESULT_URL.exec(url.trim());
  if (!m) return null;
  const params = queryParams(m[1] ?? "");
  const status = params.get("status");
  if (status === "claim") {
    const code = params.get("code") ?? "";
    if (!CODE.test(code)) return { kind: "error", reason: "link_invalid" };
    const p = params.get("provider");
    const provider = p === "google" || p === "microsoft" ? p : null;
    return { kind: "claim", code, provider };
  }
  if (status === "cancelled") return { kind: "cancelled" };
  if (status === "connected") return { kind: "connected" };
  if (status === "error") {
    const reason = params.get("reason") ?? "";
    return { kind: "error", reason: REASON.test(reason) ? reason : "server_error" };
  }
  return { kind: "error", reason: "server_error" };
}

/**
 * What openAuthSessionAsync answered. "success" carries the redirect URL;
 * "cancel" (the user closed the sheet) and "dismiss" are both "nothing
 * was connected".
 */
export function authSessionOutcome(result: { type: string; url?: string }): MailboxOutcome {
  if (result.type === "success" && typeof result.url === "string") {
    return parseMailboxUrl(result.url) ?? { kind: "error", reason: "server_error" };
  }
  return { kind: "cancelled" };
}

// ── Messages ─────────────────────────────────────────────────────────────

export type MailboxErrorKey = keyof Strings["mailboxes"]["errors"];

// One sentence per reason the callback can send (RESULT_REASONS in
// src/lib/mailboxes/oauth.ts). Unknown codes get the generic sentence.
const REASON_KEYS: Record<string, MailboxErrorKey> = {
  denied: "denied",
  admin_consent: "adminConsent",
  expired: "expired",
  invalid_state: "invalidState",
  wrong_browser: "wrongBrowser",
  wrong_account: "wrongAccount",
  exchange_failed: "exchangeFailed",
  no_mailbox: "noMailbox",
  scope_missing: "scopeMissing",
  limit: "limit",
  rate_limited: "rateLimited",
  link_invalid: "linkInvalid",
  link_expired: "linkExpired",
  link_used: "linkUsed",
  provider_unavailable: "providerUnavailable",
  // An account without access to the product (the server refuses before Google / Microsoft).
  no_access: "noAccess",
  server_error: "serverError",
};

export function reasonKey(reason: string | null | undefined): MailboxErrorKey {
  return reason && Object.hasOwn(REASON_KEYS, reason) ? REASON_KEYS[reason] : "serverError";
}

/** POST /api/mailboxes/connect-link refused (401 never gets here: it throws). */
export function connectLinkErrorKey(status: number, code: string | null = null): MailboxErrorKey {
  if (code === "no_access") return "noAccess";
  if (status === 404) return "unavailable";
  if (status === 409) return "limit";
  if (status === 429) return "rateLimited";
  return "serverError";
}

/** POST /api/mailboxes/claim refused. */
export function claimErrorKey(status: number, code: string | null): MailboxErrorKey {
  if (status === 429) return "rateLimited";
  if (code === "invalid" || status === 400 || status === 404) return "claimInvalid";
  if (code === "expired" || status === 410) return "expired";
  if (code === "wrong_account") return "wrongAccount";
  if (code === "no_access") return "noAccess";
  if (code === "limit" || status === 409) return "limit";
  return "serverError";
}

/** DELETE /api/mailboxes/<id>: 404 means it's already gone, which is what the user wanted. */
export function disconnectOutcome(status: number): "gone" | "failed" {
  return status === 200 || status === 404 ? "gone" : "failed";
}

/**
 * After a disconnect the server couldn't end at the provider (`revoked:
 * false`: always for Outlook, which has no per-app revoke; a failed Google
 * revoke): where the user removes UnReceipt's access themselves. Null when
 * it was revoked, or the answer doesn't say (a 404: already gone).
 */
export function removeAccessNote(
  provider: MailboxProvider,
  revoked: unknown,
  t: Pick<MailboxStrings, "removeAccessGoogle" | "removeAccessMicrosoft">,
): string | null {
  if (revoked !== false) return null;
  return provider === "google" ? t.removeAccessGoogle : t.removeAccessMicrosoft;
}

// ── The whole connect flow ───────────────────────────────────────────────

type Result<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

export type ConnectResult =
  | { kind: "connected"; connection: MobileMailboxConnection | null }
  | { kind: "cancelled" }
  /** The same code twice (the sheet's answer and a deep link): already handled. */
  | { kind: "duplicate" }
  /** retryCode: the claim never reached the server (offline); the same code can be sent again. */
  | { kind: "failed"; key: MailboxErrorKey; retryCode?: string }
  | { kind: "signedOut" };

export type ConnectDeps = {
  connectLink: (provider: MailboxProvider) => Promise<Result<{ url: string; expiresAt?: string }>>;
  openSession: (url: string) => Promise<{ type: string; url?: string }>;
  claim: (code: string) => Promise<Result<MobileMailboxClaim>>;
  /** Codes already sent to /claim (kept for the app's lifetime). */
  claimed: Set<string>;
};

function fromThrown(err: unknown, retryCode?: string): ConnectResult {
  if (err instanceof ApiError) {
    if (err.kind === "unauthorized") return { kind: "signedOut" };
    if (err.kind === "offline") return { kind: "failed", key: "offline", retryCode };
  }
  return { kind: "failed", key: "serverError" };
}

/** Sends a claim code once; shared by the sign-in sheet's answer and the deep-link path. */
export async function claimCode(code: string, deps: Pick<ConnectDeps, "claim" | "claimed">): Promise<ConnectResult> {
  if (deps.claimed.has(code)) return { kind: "duplicate" };
  deps.claimed.add(code);
  try {
    const res = await deps.claim(code);
    if (res.ok && "ok" in res.data && res.data.ok) return { kind: "connected", connection: res.data.connection };
    if (res.ok) return { kind: "failed", key: "serverError" };
    return { kind: "failed", key: claimErrorKey(res.status, res.code) };
  } catch (err) {
    // Never reached the server: the code is still good for a retry.
    if (err instanceof ApiError && err.kind === "offline") deps.claimed.delete(code);
    return fromThrown(err, code);
  }
}

export async function finishOutcome(
  outcome: MailboxOutcome,
  deps: Pick<ConnectDeps, "claim" | "claimed">,
): Promise<ConnectResult> {
  switch (outcome.kind) {
    case "claim":
      return claimCode(outcome.code, deps);
    case "connected":
      return { kind: "connected", connection: null };
    case "cancelled":
      return { kind: "cancelled" };
    case "error":
      return { kind: "failed", key: reasonKey(outcome.reason) };
  }
}

/** Only a web page goes to the sign-in sheet, never another app's scheme. */
export function isWebUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\/[^\s/]+\/\S*$/i.test(url);
}

/** connect-link → the sign-in sheet → claim. */
export async function runConnect(provider: MailboxProvider, deps: ConnectDeps): Promise<ConnectResult> {
  let url: string;
  try {
    const link = await deps.connectLink(provider);
    if (!link.ok) return { kind: "failed", key: connectLinkErrorKey(link.status, link.code) };
    if (!isWebUrl(link.data.url)) return { kind: "failed", key: "serverError" };
    url = link.data.url;
  } catch (err) {
    return fromThrown(err);
  }
  let session: { type: string; url?: string };
  try {
    session = await deps.openSession(url);
  } catch {
    return { kind: "failed", key: "serverError" };
  }
  return finishOutcome(authSessionOutcome(session), deps);
}

// ── Deep links that arrive outside the sign-in sheet ─────────────────────

let inboxed: MailboxOutcome | null = null;
const inboxListeners = new Set<() => void>();

/** Called by +native-intent for unreceipt://mailboxes?… */
export function putInInbox(outcome: MailboxOutcome): void {
  inboxed = outcome;
  for (const listener of inboxListeners) listener();
}

/** The waiting outcome, once. */
export function takeFromInbox(): MailboxOutcome | null {
  const out = inboxed;
  inboxed = null;
  return out;
}

export function onInbox(listener: () => void): () => void {
  inboxListeners.add(listener);
  return () => inboxListeners.delete(listener);
}

// ── A connection in plain words ──────────────────────────────────────────

type MailboxStrings = Strings["mailboxes"];

/** "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago", "4 Nov". */
export function relativeAgo(iso: string, t: MailboxStrings, locale: Locale, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return t.justNow;
  if (minutes < 60) return fill(t.minutesAgo, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fill(t.hoursAgo, { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t.yesterday;
  if (days < 7) return fill(t.daysAgo, { n: days });
  return shortDate(new Date(then), locale);
}

export type StatusTone = "ok" | "attention" | "pending";

export function statusLine(
  conn: Pick<MobileMailboxConnection, "email" | "status" | "lastReceiptAt" | "lastSyncAt">,
  t: MailboxStrings,
  locale: Locale,
  now: number = Date.now(),
): { text: string; tone: StatusTone } {
  const email = conn.email;
  if (conn.status === "needs_reconnect") return { text: fill(t.statusReconnect, { email }), tone: "attention" };
  if (conn.status === "paused") return { text: fill(t.statusPaused, { email }), tone: "attention" };
  // Active, but the first import hasn't finished yet.
  if (!conn.lastSyncAt) return { text: fill(t.statusSettingUp, { email }), tone: "pending" };
  const ago = conn.lastReceiptAt ? relativeAgo(conn.lastReceiptAt, t, locale, now) : "";
  return { text: ago ? fill(t.statusWatching, { email, ago }) : fill(t.statusWatchingNone, { email }), tone: "ok" };
}
