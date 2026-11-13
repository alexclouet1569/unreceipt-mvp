// Words for Settings → "Your email" (connected Gmail / Outlook mailboxes),
// the explainer before the provider's consent screen and the result banner
// after it. Pure: imported by server pages and client components alike.
//
// What we read is said in one sentence (WHAT_WE_READ) and nowhere longer:
// never a list of what we look at.

import type { MailboxConnectionStatus, MailboxProviderId } from "@/lib/types";

export type MailboxProviders = Record<MailboxProviderId, boolean>;

/** The connection as the website shows it (store.ts toSummary(), JSON-safe). */
export type MailboxView = {
  id: string;
  provider: MailboxProviderId;
  email: string;
  status: MailboxConnectionStatus;
  lastReceiptAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
};

export const NO_PROVIDERS: MailboxProviders = { google: false, microsoft: false };

// Gmail first: most customers are on Gmail / Workspace.
export const PROVIDER_ORDER: readonly MailboxProviderId[] = ["google", "microsoft"];

export const PROVIDER_NAME: Record<MailboxProviderId, string> = {
  google: "Gmail",
  microsoft: "Outlook",
};

// The company whose sign-in screen comes next.
export const PROVIDER_COMPANY: Record<MailboxProviderId, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

export function anyProvider(providers: MailboxProviders | null | undefined): boolean {
  return Boolean(providers && PROVIDER_ORDER.some((p) => providers[p]));
}

export function configuredList(providers: MailboxProviders | null | undefined): MailboxProviderId[] {
  return providers ? PROVIDER_ORDER.filter((p) => providers[p]) : [];
}

/** Our explainer page; it links on to the provider. */
export function explainerHref(provider: MailboxProviderId): string {
  return `/app/settings/mailboxes/connect?provider=${provider}`;
}

/**
 * Starts the OAuth flow (GET, the user's own session). A plain link, never
 * a form POST: the site's CSP form-action 'self' would block the redirect
 * to Google / Microsoft.
 */
export function connectHref(provider: MailboxProviderId): string {
  return `/api/mailboxes/connect/${provider}`;
}

export const WHAT_WE_READ =
  "UnReceipt looks only at emails that look like receipts or invoices, and saves only those. Everything else is never read into UnReceipt or stored. You can disconnect any time.";

export const PERMISSION_NOTE: Record<MailboxProviderId, string> = {
  google:
    "Google will ask to let UnReceipt read your email: that’s the only permission Gmail offers for this.",
  microsoft:
    "Microsoft will ask to let UnReceipt read your email: that’s the only permission Outlook offers for this.",
};

export const GOOGLE_UNVERIFIED_NOTE =
  "Google may show a warning that the app isn’t verified yet: choose Advanced → Continue.";

// ── Result of a connect flow (/app/settings?mailbox=…&reason=…) ──────────

export type MailboxResult =
  | { kind: "connected" }
  | { kind: "cancelled" }
  | { kind: "error"; reason: string };

export const CONNECTED_MESSAGE =
  "Connected. Receipts from the last 30 days are being imported; they appear under Review needed.";

export const CANCELLED_MESSAGE = "Nothing was connected.";

// One sentence per reason the callback can send (RESULT_REASONS in
// src/lib/mailboxes/oauth.ts, plus Microsoft's no_mailbox). Unknown codes
// get the generic sentence.
const REASON_MESSAGES: Record<string, string> = {
  denied: "You didn’t allow access, nothing was connected.",
  admin_consent:
    "Your company’s Microsoft 365 admin must approve UnReceipt first. Ask them, then try again, or forward your receipts instead.",
  expired: "That took longer than 10 minutes, so nothing was connected. Try again.",
  invalid_state: "That sign-in link was already used or isn’t valid. Try again from here.",
  wrong_browser:
    "Connecting has to finish in the browser where it started. Try again from here.",
  wrong_account:
    "You’re signed in to a different UnReceipt account than the one that started connecting. Sign in with that account and try again.",
  exchange_failed: "Your email provider didn’t confirm the connection. Try again.",
  scope_missing: "Tick the box that lets UnReceipt read your email, then try again.",
  limit: "You’ve connected 5 mailboxes, the most there can be. Disconnect one to add another.",
  rate_limited: "Too many tries in a short time. Wait a few minutes and try again.",
  link_invalid: "That connect link isn’t valid. Start again from here.",
  link_expired: "That connect link has expired. Start again from here.",
  link_used: "That connect link was already used. Start again from here.",
  provider_unavailable:
    "Your email provider couldn’t be reached just now. Try again in a few minutes.",
  no_mailbox:
    "That Microsoft account has no Outlook mailbox UnReceipt can read. Sign in with the account that holds your email.",
  server_error: "Something went wrong on our side, nothing was connected. Try again.",
};

export function reasonMessage(reason: string | null | undefined): string {
  return (reason && Object.hasOwn(REASON_MESSAGES, reason) ? REASON_MESSAGES[reason] : null) ??
    REASON_MESSAGES.server_error;
}

/** Reads ?mailbox= and ?reason= from Settings' address. Null when absent. */
export function parseMailboxResult(
  mailbox: string | string[] | undefined,
  reason: string | string[] | undefined,
): MailboxResult | null {
  const value = Array.isArray(mailbox) ? mailbox[0] : mailbox;
  if (value === "connected") return { kind: "connected" };
  if (value === "cancelled") return { kind: "cancelled" };
  if (value === "error") {
    const code = Array.isArray(reason) ? reason[0] : reason;
    // Short fixed codes only; anything else reads as the generic error.
    return { kind: "error", reason: code && /^[a-z_]{1,40}$/.test(code) ? code : "server_error" };
  }
  return null;
}

// ── A connection's status line ─────────────────────────────────────────

/** "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago", "4 Nov". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const date = new Date(then);
  const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

export type StatusTone = "ok" | "attention" | "pending";

export function statusLine(conn: MailboxView, now: number = Date.now()): { text: string; tone: StatusTone } {
  if (conn.status === "needs_reconnect") return { text: "Reconnect needed", tone: "attention" };
  if (conn.status === "paused") return { text: "Paused · not reading new email", tone: "attention" };
  // Active, but the first import hasn't finished yet.
  if (!conn.lastSyncAt) return { text: "Setting up…", tone: "pending" };
  const last = conn.lastReceiptAt ? relativeTime(conn.lastReceiptAt, now) : "";
  return {
    text: last ? `Watching for receipts · last receipt ${last}` : "Watching for receipts · none yet",
    tone: "ok",
  };
}
