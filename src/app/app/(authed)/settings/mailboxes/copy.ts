// Words for Settings → "Connected email" (connected Gmail / Outlook
// mailboxes), the explainer before the provider's consent screen and the
// result banner after it. Pure: imported by server pages and client
// components alike.
//
// What we read is said once, in WHAT_WE_READ (the explainer); keep it true
// to src/lib/mailboxes/select.ts and the privacy page. Words quoted from
// Google's own screens live in provider-labels.ts.

import type { MailboxConnectionStatus, MailboxProviderId } from "@/lib/types";
import { GOOGLE_SCREEN } from "./provider-labels";

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
export function explainerHref(provider: MailboxProviderId, { reconnect = false } = {}): string {
  return `/app/settings/mailboxes/connect?provider=${provider}${reconnect ? "&reconnect=1" : ""}`;
}

/** "Gmail or Outlook", "Gmail": the providers that can be connected here. */
export function providerNames(providers: MailboxProviders | null | undefined): string {
  return configuredList(providers)
    .map((p) => PROVIDER_NAME[p])
    .join(" or ");
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
  "To spot receipts, UnReceipt checks the sender, subject and attachment names of new emails. Emails that look like a receipt, invoice or order confirmation are opened and saved in your account, with the email as the original. Other emails are never opened or saved. If something that isn’t a purchase gets in, delete it under Review needed. Saved receipts are read by Anthropic’s Claude AI on our behalf to fill in their fields (never used to train AI), and your accountant sees them once you’ve confirmed them. We also pick up receipts from the last 30 days. UnReceipt can’t send, change or delete anything in your mailbox.";

/** The privacy page's section on mailbox data (Google's Limited Use statement). */
export const PRIVACY_LINK = {
  href: "https://unreceipt.com/privacy#gmail",
  text: "How we handle your email",
} as const;

export const PERMISSION_NOTE: Record<MailboxProviderId, string> = {
  google:
    "Google will ask to let UnReceipt read your email: that’s the only permission Gmail offers for this.",
  microsoft:
    "Microsoft will ask to let UnReceipt read your email: that’s the only permission Outlook offers for this.",
};

/** Copy with words to set in bold: the names of buttons on another screen. */
export type CopyPart = string | { strong: string };

export function plainText(parts: readonly CopyPart[]): string {
  return parts.map((p) => (typeof p === "string" ? p : p.strong)).join("");
}

// Shown while GOOGLE_OAUTH_VERIFIED isn't "true" (Google's review of the
// restricted gmail.readonly scope).
export const GOOGLE_UNVERIFIED_NOTE: readonly CopyPart[] = [
  `Google checks new apps before removing a warning, and ours is still being checked. You’ll see ‘${GOOGLE_SCREEN.unverifiedTitle.text}’. Tap `,
  { strong: GOOGLE_SCREEN.advanced.text },
  ", then ",
  { strong: GOOGLE_SCREEN.goToApp.text },
  ". It doesn’t change what UnReceipt can see.",
];

// ── Result of a connect flow (/app/settings?mailbox=…&reason=…) ──────────

export type MailboxResult =
  | { kind: "connected" }
  | { kind: "cancelled" }
  | { kind: "error"; reason: string };

export const CONNECTED_MESSAGE =
  "Connected. Receipts from the last 30 days are being imported; they appear under Review needed.";

export const CANCELLED_MESSAGE = "Nothing was connected.";

// The OAuth state or the app's one-time link is gone: used, expired or
// never ours. The customer can't tell these apart, so one sentence.
const ATTEMPT_GONE = "That connection attempt expired or was already used. Start again.";

// One sentence per reason the callback can send (RESULT_REASONS in
// src/lib/mailboxes/oauth.ts, plus Microsoft's no_mailbox). Unknown codes
// get the generic sentence.
const REASON_MESSAGES: Record<string, string> = {
  denied: "You didn’t allow access, nothing was connected.",
  admin_consent:
    "Your company’s Microsoft 365 admin must approve UnReceipt first. Ask them, then try again, or forward your receipts instead.",
  expired: "That took longer than 10 minutes, so nothing was connected. Try again.",
  invalid_state: ATTEMPT_GONE,
  wrong_browser:
    "Connecting has to finish in the browser where it started. Try again from here.",
  wrong_account:
    "You’re signed in to a different UnReceipt account than the one that started connecting. Sign in with that account and try again.",
  exchange_failed: "Your email provider didn’t confirm the connection. Try again.",
  scope_missing: `On Google’s screen, tick the box ‘${GOOGLE_SCREEN.readEmail.text}’, then try again.`,
  limit: "You’ve connected as many mailboxes as you can. Disconnect one to add another.",
  rate_limited: "Too many tries in a short time. Wait a few minutes and try again.",
  link_invalid: ATTEMPT_GONE,
  link_expired: ATTEMPT_GONE,
  link_used: ATTEMPT_GONE,
  provider_unavailable:
    "Your email provider couldn’t be reached just now. Try again in a few minutes.",
  no_mailbox:
    "That Microsoft account has no Outlook mailbox UnReceipt can read. Sign in with the account that holds your email.",
  // The account has no product access (no active plan), so it can't
  // connect a mailbox. No prices: the store apps show this too.
  no_access:
    "This account can’t connect a mailbox right now. Check your plan in Settings, or forward receipts instead.",
  server_error: "Something went wrong on our side, nothing was connected. Try again.",
};

/** The banner's sentence for a reason code; `limit` is CONNECTION_LIMIT. */
export function reasonMessage(reason: string | null | undefined, limit?: number): string {
  if (reason === "limit" && limit) {
    return `You’ve connected ${limit} mailboxes, the most there can be. Disconnect one to add another.`;
  }
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

// After a disconnect that couldn't end UnReceipt's access at the provider
// (Microsoft has no per-app revoke; a Google revoke can fail): where the
// user removes it themselves.
export const REMOVE_ACCESS_NOTE: Record<MailboxProviderId, string> = {
  google:
    "To remove UnReceipt’s access completely, also remove it in your Google account at myaccount.google.com/permissions.",
  microsoft:
    "To remove UnReceipt’s access completely, also remove it in your Microsoft account (account.microsoft.com → Privacy → Apps; work: myapps.microsoft.com).",
};

// No prices or plans here: the store apps show this too.
export const PAUSED_TEXT =
  "Paused: your account doesn’t have access right now, so new email isn’t read. After 30 days paused, the mailbox is disconnected.";

export type StatusTone = "ok" | "attention" | "pending";

export function statusLine(conn: MailboxView, now: number = Date.now()): { text: string; tone: StatusTone } {
  if (conn.status === "needs_reconnect") return { text: "Reconnect needed", tone: "attention" };
  // Set while the account has no product access (src/lib/mailboxes/sync.ts);
  // reading resumes by itself once it has.
  if (conn.status === "paused") return { text: PAUSED_TEXT, tone: "attention" };
  // Active, but the first import hasn't finished yet.
  if (!conn.lastSyncAt) return { text: "Setting up…", tone: "pending" };
  const last = conn.lastReceiptAt ? relativeTime(conn.lastReceiptAt, now) : "";
  return {
    text: last ? `Watching for receipts · last receipt ${last}` : "Watching for receipts · none yet",
    tone: "ok",
  };
}
