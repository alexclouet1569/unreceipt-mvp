// SERVER-ONLY. The Outlook.com / Hotmail / Microsoft 365 adapter
// (MailboxProvider, ./types.ts), plain fetch against Microsoft's documented
// REST APIs (no SDK).
//
//   OAuth   login.microsoftonline.com/common (personal and work accounts),
//           v2.0 authorize + token, PKCE S256, response_mode=query. Scopes:
//           openid email offline_access User.Read Mail.Read. Refresh tokens
//           rotate: every refresh returns a new one (access-token.ts stores
//           it). There is no per-token revocation for a delegated refresh
//           token, so revoke() does nothing: disconnecting deletes the
//           subscription (stopWatch) and our row, and the user can remove
//           the app at account.microsoft.com / myapps.microsoft.com.
//   Address GET /me?$select=mail,userPrincipalName (mail is often null for
//           personal accounts: the sign-in name is the address then).
//   Push    a Graph subscription on me/mailFolders('inbox')/messages
//           (changeType created) to /api/mailboxes/push/microsoft, with
//           MS_GRAPH_CLIENT_STATE as its clientState. It lasts SUBSCRIPTION_
//           MINUTES; startWatch() renews it (PATCH) or creates a new one
//           when it is gone, so the daily job (/api/cron/mailboxes) keeps it
//           alive. stopWatch() deletes it.
//   Sync    delta on the inbox (/me/mailFolders/inbox/messages/delta),
//           paged with @odata.nextLink, ending on an @odata.deltaLink that
//           the next sync continues from. The first round is filtered to
//           mail received since the connection was made (or the backfill
//           boundary), so connecting never imports the whole inbox. The
//           backfill (backfillDays) lists the window newest first, then
//           starts the delta.
//   Pick    the delta/list rows carry subject, sender and hasAttachments;
//           attachment names are asked only for a message with attachments
//           whose subject didn't already match. isLikelyReceipt()
//           (./select.ts) decides; only a match is downloaded in full
//           (/$value, raw MIME) and handed to the shared ingest
//           (ingestReceiptEmail) after the rate limit and a short claim
//           (./claim.ts). Nothing about other messages is stored.
//
// The stored cursor (mailbox_connections.cursor) is a small JSON object,
// {"v":1,"link":<Graph delta URL>,"since":<ISO>}: the URL to continue the
// delta from, and the receivedDateTime below which a delta row is ignored.
// Graph's message delta also reports read/unread changes of older mail;
// `since` keeps those from being read again (a receipt the user deleted
// would otherwise come back the next time they open the email). It moves up
// to SINCE_SLACK before the newest mail seen whenever a round completes.
//
// Throttling (429/503/504, Retry-After) stops the sync with the cursor where
// it was: the next notification or the daily job goes on from there.
//
// Never logs subjects, addresses, message ids, links or tokens.

import * as Sentry from "@sentry/nextjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { absoluteAppUrl } from "@/lib/app-url";
import { ingestReceiptEmail } from "@/lib/email/ingest";
import { CLAUDE_CALL_BUDGET_MS } from "@/lib/ocr";
import { rateLimit } from "@/lib/rate-limit";
import { claimMessage } from "./claim";
import { parseRawMessage } from "./raw-message";
import { isLikelyReceipt } from "./select";
import { mailboxTrust } from "./trust";
import {
  MailboxProviderError,
  MissingScopeError,
  ReauthRequiredError,
  type ExchangedTokens,
  type MailboxConnectionRef,
  type MailboxProvider,
  type RefreshedAccessToken,
  type SyncOptions,
  type SyncResult,
  type WatchResult,
} from "./types";

export const MS_AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
export const MS_AUTH_URL = `${MS_AUTHORITY}/authorize`;
export const MS_TOKEN_URL = `${MS_AUTHORITY}/token`;
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const MS_SCOPES = ["openid", "email", "offline_access", "User.Read", "Mail.Read"] as const;
export const PUSH_PATH = "/api/mailboxes/push/microsoft";
/** What the subscription watches: new mail in the inbox. */
export const SUBSCRIPTION_RESOURCE = "me/mailFolders('inbox')/messages";
/**
 * Lifetime of a subscription. Graph allows up to 10,080 minutes for Outlook
 * messages (4,230 in older documentation); 4,000 stays under both, and the
 * daily job renews anything ending within 48 h.
 */
export const SUBSCRIPTION_MINUTES = 4000;
/** Window read when there is no usable cursor (or Graph lost its state). */
export const FALLBACK_DAYS = 7;
/** Full downloads per sync when the caller sets no maxMessages. */
export const DEFAULT_MAX_MESSAGES = 100;
/** Rows looked at per sync (delta), whatever matches: bounds a burst. */
export const MAX_SCANNED = 1000;
/** Rows looked at by the backfill: there is no server-side subject search. */
export const BACKFILL_MAX_SCANNED = 3000;
/** How far below the newest mail seen `since` stays (late-visible mail). */
export const SINCE_SLACK_MS = 15 * 60 * 1000;
/** The delta started after a backfill reaches this far back (overlap). */
const BACKFILL_OVERLAP_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;
const LIST_SELECT = "subject,from,hasAttachments,internetMessageId,receivedDateTime";
// The original .eml is the receipt's evidence; bounded like Resend's.
const MAX_RAW_BYTES = 15 * 1024 * 1024;
// One more message is started only while an ingest still fits.
const MESSAGE_RESERVE_MS = CLAUDE_CALL_BUDGET_MS + 15_000;
const CALL_TIMEOUT_MS = 15_000;
const RAW_TIMEOUT_MS = 30_000;

function env() {
  return {
    clientId: process.env.MS_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.MS_OAUTH_CLIENT_SECRET ?? "",
    clientState: process.env.MS_GRAPH_CLIENT_STATE ?? "",
  };
}

/** Graph refuses a clientState over 128 characters. */
export function clientStateUsable(value: string): boolean {
  return value.length >= 16 && value.length <= 128;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

async function call(url: string, init: RequestInit, timeoutMs = CALL_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    // Network failure or timeout: a short code only.
    throw new MailboxProviderError("microsoft_unreachable");
  }
}

/** ISO without milliseconds, as Graph's examples write DateTimeOffset. */
const isoSeconds = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// ─── OAuth ──────────────────────────────────────────────────────────────

async function tokenRequest(form: Record<string, string>): Promise<{ res: Response; body: Record<string, unknown> }> {
  const res = await call(MS_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { res, body: await readJson(res) };
}

// AADSTS codes meaning "the grant is gone, only a new sign-in helps":
// 70008 expired, 700082 expired after 90 days unused, 50173 password
// changed, 65001 consent revoked, 50076/50079 new MFA needed, 53003
// blocked by Conditional Access, 50078 expired MFA, 700084 a token issued
// to a SPA.
const REAUTH_AADSTS = /AADSTS(70008|700082|50173|65001|50076|50079|53003|700084|50078)\b/;
const REAUTH_ERRORS = new Set(["invalid_grant", "interaction_required", "consent_required"]);

/** True when Microsoft's token error means the user must connect again. */
export function isReauthError(body: Record<string, unknown>): boolean {
  const error = typeof body.error === "string" ? body.error : "";
  if (REAUTH_ERRORS.has(error)) return true;
  return REAUTH_AADSTS.test(typeof body.error_description === "string" ? body.error_description : "");
}

/**
 * A short code for a token error that isn't the user's: a wrong or expired
 * client secret (AADSTS7000215/7000222) must alert us, never mark every
 * mailbox as needing a reconnect.
 */
function tokenErrorCode(prefix: string, body: Record<string, unknown>): string {
  return body.error === "invalid_client" || body.error === "unauthorized_client" ? "client_invalid" : `${prefix}_failed`;
}

function expiresAtOf(body: Record<string, unknown>): number {
  const raw = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 3600;
  return Date.now() + seconds * 1000;
}

/** Graph scopes come back as "Mail.Read" or "https://graph.microsoft.com/Mail.Read". */
export function hasMailRead(scope: unknown): boolean | null {
  if (typeof scope !== "string") return null;
  return scope
    .split(/\s+/)
    .map((s) => s.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, ""))
    .some((s) => s === "mail.read" || s === "mail.readwrite");
}

function graphGet(accessToken: string, url: string, timeoutMs?: number, headers: Record<string, string> = {}) {
  return call(url, { headers: { authorization: `Bearer ${accessToken}`, ...headers } }, timeoutMs);
}

function graphSend(accessToken: string, method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) {
  return call(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Graph's error code ("ErrorAccessDenied", "SyncStateNotFound", …), if any. */
async function graphErrorCode(res: Response): Promise<string> {
  const body = await readJson(res.clone());
  const err = isRecord(body.error) ? body.error : {};
  return typeof err.code === "string" ? err.code : "";
}

/** The address of the signed-in account: mail, else the sign-in name. */
export function addressFromProfile(body: Record<string, unknown>): string | null {
  const mail = str(body.mail);
  if (mail && mail.includes("@")) return mail;
  const upn = str(body.userPrincipalName);
  // A guest's sign-in name ("anna_gmail.com#EXT#@tenant…") isn't an address.
  if (upn && upn.includes("@") && !upn.includes("#EXT#")) return upn;
  return null;
}

async function readAddress(accessToken: string): Promise<string> {
  const res = await graphGet(accessToken, `${GRAPH}/me?$select=mail,userPrincipalName`);
  if (!res.ok) throw new MailboxProviderError("profile_failed", res.status);
  const email = addressFromProfile(await readJson(res));
  if (!email) throw new MailboxProviderError("profile_failed", res.status);
  return email;
}

/**
 * The account has a mailbox Graph can read. A Microsoft account opened with
 * another provider's address, or a work account without an Exchange
 * Online licence, signs in fine but has none.
 */
async function checkInbox(accessToken: string): Promise<void> {
  const res = await graphGet(accessToken, `${GRAPH}/me/mailFolders/inbox?$select=id`);
  if (res.ok) return;
  const code = await graphErrorCode(res);
  if (res.status === 403 && code === "ErrorAccessDenied") throw new MissingScopeError("microsoft");
  if (res.status === 404 || code === "MailboxNotEnabledForRESTAPI" || code === "MailboxNotSupportedForRESTAPI") {
    throw new MailboxProviderError("no_mailbox", res.status);
  }
  throw new MailboxProviderError("mailbox_check_failed", res.status);
}

// ─── Push ───────────────────────────────────────────────────────────────

function subscriptionUrl(id: string): string {
  return `${GRAPH}/subscriptions/${encodeURIComponent(id)}`;
}

const expiryFromNow = () => isoSeconds(Date.now() + SUBSCRIPTION_MINUTES * 60 * 1000);

function watchFrom(body: Record<string, unknown>, fallbackId: string | null, requested: string): WatchResult {
  const id = str(body.id) ?? fallbackId;
  if (!id) throw new MailboxProviderError("watch_failed");
  const expires = str(body.expirationDateTime);
  const parsed = expires ? Date.parse(expires) : NaN;
  return {
    watchId: id,
    expiresAt: new Date(Number.isFinite(parsed) ? parsed : Date.parse(requested)).toISOString(),
    // The delta cursor belongs to sync(); a renewal never moves it.
    cursor: null,
  };
}

async function createSubscription(accessToken: string): Promise<WatchResult> {
  const clientState = env().clientState;
  if (!clientStateUsable(clientState)) throw new MailboxProviderError("push_not_configured");
  const expirationDateTime = expiryFromNow();
  // Graph calls the notification URL with a validationToken before it
  // answers (the push route echoes it), so this can take a few seconds.
  const res = await graphSend(accessToken, "POST", `${GRAPH}/subscriptions`, {
    changeType: "created",
    notificationUrl: absoluteAppUrl(PUSH_PATH),
    resource: SUBSCRIPTION_RESOURCE,
    expirationDateTime,
    clientState,
    latestSupportedTlsVersion: "v1_2",
  });
  if (!res.ok) throw new MailboxProviderError("watch_failed", res.status);
  return watchFrom(await readJson(res), null, expirationDateTime);
}

// ─── Change notifications ───────────────────────────────────────────────

const MAX_NOTIFICATION_ITEMS = 1000;
const SUBSCRIPTION_ID = /^[A-Za-z0-9-]{1,128}$/;
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Constant-time: a notification's clientState is ours. */
export function clientStateMatches(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || expected.length === 0) return false;
  return timingSafeEqual(digest(received), digest(expected));
}

/**
 * The subscription ids named by the items of a Graph notification body
 * ({ value: [{ subscriptionId, clientState, … }] }) that carry our
 * clientState, deduplicated, and how many items were dropped.
 */
export function acceptedSubscriptions(body: unknown, expected: string): { ids: string[]; refused: number } {
  const value = isRecord(body) ? body.value : undefined;
  if (!Array.isArray(value)) return { ids: [], refused: 0 };
  const ids = new Set<string>();
  let refused = Math.max(0, value.length - MAX_NOTIFICATION_ITEMS);
  for (const item of value.slice(0, MAX_NOTIFICATION_ITEMS)) {
    const subscriptionId = isRecord(item) ? item.subscriptionId : undefined;
    const clientState = isRecord(item) ? item.clientState : undefined;
    if (typeof subscriptionId !== "string" || !SUBSCRIPTION_ID.test(subscriptionId) || !clientStateMatches(clientState, expected)) {
      refused++;
      continue;
    }
    ids.add(subscriptionId);
  }
  return { ids: [...ids], refused };
}

// ─── Delta cursor ───────────────────────────────────────────────────────

export type DeltaCursor = { link: string; since: string };

/** Only Graph's own v1.0 URLs for this user are ever called with the token. */
export function isGraphMeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === "graph.microsoft.com" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname.toLowerCase().startsWith("/v1.0/me/")
  );
}

export function encodeCursor(c: DeltaCursor): string {
  return JSON.stringify({ v: 1, link: c.link, since: c.since });
}

/** The stored cursor, or null when it is missing or not one of ours. */
export function decodeCursor(raw: string | null): DeltaCursor | null {
  if (!raw || raw.length > 8192) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== 1) return null;
  const link = str(value.link);
  const since = str(value.since);
  if (!link || !since || !isGraphMeUrl(link) || !Number.isFinite(Date.parse(since))) return null;
  return { link, since };
}

/** The first request of a delta round: inbox mail received since `sinceMs`. */
export function initialDeltaUrl(sinceMs: number): string {
  const filter = encodeURIComponent(`receivedDateTime ge ${isoSeconds(sinceMs)}`);
  return `${GRAPH}/me/mailFolders/inbox/messages/delta?$select=${LIST_SELECT}&$filter=${filter}`;
}

/** The backfill: inbox mail received since `sinceMs`, newest first. */
export function windowListUrl(sinceMs: number): string {
  const filter = encodeURIComponent(`receivedDateTime ge ${isoSeconds(sinceMs)}`);
  const orderby = encodeURIComponent("receivedDateTime desc");
  return `${GRAPH}/me/mailFolders/inbox/messages?$filter=${filter}&$orderby=${orderby}&$top=${PAGE_SIZE}&$select=${LIST_SELECT}`;
}

// ─── One sync ───────────────────────────────────────────────────────────

class StopSync extends Error {
  constructor(public readonly reason: "throttled") {
    super(reason);
  }
}

class SyncStateLost extends Error {}

const THROTTLED = new Set([429, 503, 504, 509]);

type Outcome = "done" | "stop";

type Row = {
  id: string;
  subject: string;
  from: string;
  hasAttachments: boolean;
  internetMessageId: string | null;
  received: number;
};

function rowOf(item: unknown): Row | null {
  if (!isRecord(item) || "@removed" in item) return null;
  const id = str(item.id);
  const received = typeof item.receivedDateTime === "string" ? Date.parse(item.receivedDateTime) : NaN;
  if (!id || id.length > 512 || !Number.isFinite(received)) return null;
  const from = isRecord(item.from) && isRecord(item.from.emailAddress) ? item.from.emailAddress : {};
  const name = typeof from.name === "string" ? from.name : "";
  const address = typeof from.address === "string" ? from.address : "";
  return {
    id,
    subject: typeof item.subject === "string" ? item.subject.slice(0, 500) : "",
    from: address ? `${name} <${address}>`.trim() : name,
    hasAttachments: item.hasAttachments === true,
    internetMessageId: str(item.internetMessageId),
    received,
  };
}

class GraphSync {
  processed = 0;
  created = 0;
  scanned = 0;
  private readonly maxMessages: number;
  private readonly seen = new Set<string>();

  constructor(
    private readonly conn: MailboxConnectionRef,
    private readonly accessToken: string,
    private readonly opts: SyncOptions,
  ) {
    this.maxMessages = Math.max(0, opts.maxMessages ?? DEFAULT_MAX_MESSAGES);
  }

  outOfTime(): boolean {
    return this.opts.deadline !== undefined && Date.now() > this.opts.deadline - MESSAGE_RESERVE_MS;
  }

  /** One page of a delta round or of the backfill list. */
  private async page(url: string, kind: "delta" | "list"): Promise<Record<string, unknown>> {
    if (!isGraphMeUrl(url)) throw new MailboxProviderError("graph_bad_link");
    const res = await graphGet(this.accessToken, url, CALL_TIMEOUT_MS, {
      prefer: `odata.maxpagesize=${PAGE_SIZE}`,
    });
    if (THROTTLED.has(res.status)) throw new StopSync("throttled");
    if (!res.ok) {
      // The delta state behind the link expired (or was reset).
      if (kind === "delta" && (res.status === 410 || /syncstate|resync/i.test(await graphErrorCode(res)))) {
        throw new SyncStateLost();
      }
      throw new MailboxProviderError(kind === "delta" ? "graph_delta_failed" : "graph_list_failed", res.status);
    }
    return readJson(res);
  }

  private async attachmentNames(id: string): Promise<string[]> {
    const res = await graphGet(
      this.accessToken,
      `${GRAPH}/me/messages/${encodeURIComponent(id)}/attachments?$select=name,contentType`,
    );
    if (THROTTLED.has(res.status)) throw new StopSync("throttled");
    if (res.status === 404) return [];
    if (!res.ok) throw new MailboxProviderError("graph_attachments_failed", res.status);
    const body = await readJson(res);
    return (Array.isArray(body.value) ? body.value : [])
      .slice(0, 50)
      .map((a) => (isRecord(a) ? str(a.name) : null))
      .filter((n): n is string => n !== null)
      .map((n) => n.slice(0, 255));
  }

  private async likely(row: Row): Promise<boolean> {
    const meta = { subject: row.subject, from: row.from, attachmentNames: [] as string[], hasAttachments: row.hasAttachments };
    if (isLikelyReceipt(meta)) return true;
    if (!row.hasAttachments) return false;
    return isLikelyReceipt({ ...meta, attachmentNames: await this.attachmentNames(row.id) });
  }

  /**
   * One row: pick, then (for a match) rate limit, claim, download, ingest.
   * "stop" leaves this row unread, for the next sync. `onClaimed` is what a
   * claim held by another sync means: stop (delta: the cursor must not pass
   * the row) or skip (backfill: the cursor doesn't depend on it).
   */
  async handle(row: Row, onClaimed: "stop" | "skip"): Promise<"done" | "stop"> {
    if (this.seen.has(row.id)) return "done";
    this.seen.add(row.id);
    if (!(await this.likely(row))) return "done";
    if (this.processed >= this.maxMessages || this.outOfTime()) return "stop";
    // Before the download and any Claude call: a flood stops here.
    const limited = await rateLimit("mailboxIngest", this.conn.id);
    if (!limited.ok) return "stop";
    if (!(await claimMessage(this.conn.id, row.id))) return onClaimed === "stop" ? "stop" : "done";

    const res = await graphGet(this.accessToken, `${GRAPH}/me/messages/${encodeURIComponent(row.id)}/$value`, RAW_TIMEOUT_MS);
    if (THROTTLED.has(res.status)) throw new StopSync("throttled");
    // Deleted or moved since the change was listed.
    if (res.status === 404) return "done";
    if (!res.ok) throw new MailboxProviderError("graph_raw_failed", res.status);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RAW_BYTES) return "done";
    const rawEml = Buffer.from(await res.arrayBuffer());
    if (rawEml.length === 0 || rawEml.length > MAX_RAW_BYTES) return "done";
    this.processed++;

    const parsed = parseRawMessage(rawEml);
    try {
      const result = await ingestReceiptEmail({
        userId: this.conn.user_id,
        source: "mailbox",
        rawEml,
        text: parsed.text,
        html: parsed.html,
        subject: parsed.subject || row.subject,
        from: parsed.from || row.from,
        to: this.conn.email,
        messageId: parsed.messageId ?? row.internetMessageId,
        trust: mailboxTrust({ rawEml, provider: "microsoft", mailboxEmail: this.conn.email }),
        deadline:
          this.opts.deadline === undefined ? undefined : this.opts.deadline - CLAUDE_CALL_BUDGET_MS - 10_000,
      });
      if (result.kind === "created") this.created++;
      // "retry": nothing was saved (database or storage blip). Stop before
      // this row so the next sync reads it again.
      return result.kind === "retry" ? "stop" : "done";
    } catch (err) {
      // A bug, not a blip: retrying would only repeat the paid calls. The
      // message is skipped and reported (no content in the report).
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "ingest", provider: "microsoft" } });
      return "done";
    }
  }

  /**
   * One delta round from `start`. Returns the cursor to store: the
   * deltaLink with `since` moved up when the round completed, or the page
   * to read again when it stopped (the rows before the stop are recognised
   * by the claim and the ingest's dedupe).
   */
  async delta(start: DeltaCursor): Promise<{ cursor: DeltaCursor; outcome: Outcome }> {
    const sinceMs = Date.parse(start.since);
    let link = start.link;
    let newest = -Infinity;
    for (;;) {
      if (this.outOfTime()) return { cursor: { link, since: start.since }, outcome: "stop" };
      let page: Record<string, unknown>;
      try {
        page = await this.page(link, "delta");
      } catch (err) {
        if (err instanceof StopSync) return { cursor: { link, since: start.since }, outcome: "stop" };
        throw err;
      }
      const items = Array.isArray(page.value) ? page.value : [];
      for (const item of items) {
        const row = rowOf(item);
        if (!row) continue;
        this.scanned++;
        // Older mail: a read/unread change, or a message moved into the
        // inbox. Never read again.
        if (row.received < sinceMs) continue;
        newest = Math.max(newest, row.received);
        let outcome: "done" | "stop";
        try {
          outcome = await this.handle(row, "stop");
        } catch (err) {
          if (err instanceof StopSync) outcome = "stop";
          else throw err;
        }
        if (outcome === "stop") return { cursor: { link, since: start.since }, outcome: "stop" };
      }
      const next = str(page["@odata.nextLink"]);
      const deltaLink = str(page["@odata.deltaLink"]);
      if (next) {
        if (!isGraphMeUrl(next)) throw new MailboxProviderError("graph_bad_link");
        link = next;
        // Scan cap: this page is done, the next sync goes on from here.
        if (this.scanned >= MAX_SCANNED) return { cursor: { link, since: start.since }, outcome: "stop" };
        continue;
      }
      if (!deltaLink || !isGraphMeUrl(deltaLink)) throw new MailboxProviderError("graph_bad_link");
      // Round complete: everything received up to the newest row seen has
      // been listed, give or take mail that becomes visible a little late.
      const moved = Math.min(newest, Date.now()) - SINCE_SLACK_MS;
      const since = Number.isFinite(moved) && moved > sinceMs ? new Date(moved).toISOString() : start.since;
      return { cursor: { link: deltaLink, since }, outcome: "done" };
    }
  }

  /** The backfill window, newest first, until maxMessages / the scan cap / time. */
  async window(sinceMs: number): Promise<Outcome> {
    let link: string | null = windowListUrl(sinceMs);
    while (link) {
      if (this.outOfTime() || this.scanned >= BACKFILL_MAX_SCANNED) return "stop";
      const page = await this.page(link, "list");
      for (const item of Array.isArray(page.value) ? page.value : []) {
        const row = rowOf(item);
        if (!row || row.received < sinceMs) continue;
        this.scanned++;
        if ((await this.handle(row, "skip")) === "stop") return "stop";
      }
      const next = str(page["@odata.nextLink"]);
      if (next && !isGraphMeUrl(next)) throw new MailboxProviderError("graph_bad_link");
      link = next;
    }
    return "done";
  }
}

/** Where a delta starts without a usable cursor: never before the connection. */
function freshStart(conn: MailboxConnectionRef, notBefore: number | null, now: number): DeltaCursor {
  const created = Date.parse(conn.created_at);
  const sinceMs = Math.max(
    Number.isFinite(created) ? created : now,
    now - FALLBACK_DAYS * 24 * 60 * 60 * 1000,
    notBefore ?? -Infinity,
  );
  return { link: initialDeltaUrl(sinceMs), since: new Date(sinceMs).toISOString() };
}

function result(run: GraphSync, previous: string | null, cursor: DeltaCursor | null): SyncResult {
  const encoded = cursor ? encodeCursor(cursor) : null;
  return {
    cursor: encoded === null || encoded === previous ? null : encoded,
    processed: run.processed,
    created: run.created,
  };
}

async function syncGraph(conn: MailboxConnectionRef, accessToken: string, opts: SyncOptions): Promise<SyncResult> {
  const run = new GraphSync(conn, accessToken, opts);
  const now = Date.now();

  if (opts.backfillDays && opts.backfillDays > 0) {
    const days = Math.min(Math.floor(opts.backfillDays), 365);
    // New mail from just before the backfill started is the delta's.
    const deltaFrom = now - BACKFILL_OVERLAP_MS;
    const start: DeltaCursor = { link: initialDeltaUrl(deltaFrom), since: new Date(deltaFrom).toISOString() };
    let windowOutcome: Outcome;
    try {
      windowOutcome = await run.window(now - days * 24 * 60 * 60 * 1000);
    } catch (err) {
      if (!(err instanceof StopSync)) throw err;
      windowOutcome = "stop";
    }
    // Capped, limited, throttled or out of time: the rest of the window is
    // left (the backfill is best effort) and the next sync starts the delta.
    if (windowOutcome === "stop") return result(run, conn.cursor, start);
    try {
      return result(run, conn.cursor, (await run.delta(start)).cursor);
    } catch (err) {
      if (err instanceof SyncStateLost) return result(run, conn.cursor, start);
      throw err;
    }
  }

  const stored = decodeCursor(conn.cursor);
  const start = stored ?? freshStart(conn, null, now);
  try {
    return result(run, conn.cursor, (await run.delta(start)).cursor);
  } catch (err) {
    if (!(err instanceof SyncStateLost)) throw err;
  }
  // Graph no longer keeps that state: start a new round, from no earlier
  // than where the old one had got to (the ingest dedupes the overlap).
  const restart = freshStart(conn, stored ? Date.parse(stored.since) : null, now);
  try {
    return result(run, conn.cursor, (await run.delta(restart)).cursor);
  } catch (err) {
    if (err instanceof SyncStateLost) throw new MailboxProviderError("graph_sync_state_lost", 410);
    throw err;
  }
}

// ─── The adapter ────────────────────────────────────────────────────────

export const microsoftProvider: MailboxProvider = {
  id: "microsoft",

  configured() {
    const e = env();
    return Boolean(e.clientId && e.clientSecret && clientStateUsable(e.clientState));
  },

  authUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env().clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: MS_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      // Someone signed in to two accounts picks the one to connect.
      prompt: "select_account",
    });
    return `${MS_AUTH_URL}?${params}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }): Promise<ExchangedTokens> {
    const e = env();
    const { res, body } = await tokenRequest({
      client_id: e.clientId,
      client_secret: e.clientSecret,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      scope: MS_SCOPES.join(" "),
    });
    if (!res.ok) throw new MailboxProviderError(tokenErrorCode("exchange", body), res.status);
    const accessToken = str(body.access_token);
    const refreshToken = str(body.refresh_token);
    if (!accessToken) throw new MailboxProviderError("exchange_failed", res.status);
    // Nothing to revoke on Microsoft's side (see revoke below).
    if (hasMailRead(body.scope) === false) throw new MissingScopeError("microsoft");
    if (!refreshToken) throw new MailboxProviderError("no_refresh_token");
    const email = await readAddress(accessToken);
    await checkInbox(accessToken);
    return { refreshToken, accessToken, expiresAt: expiresAtOf(body), email };
  },

  async refreshAccessToken(refreshToken): Promise<RefreshedAccessToken> {
    const e = env();
    const { res, body } = await tokenRequest({
      client_id: e.clientId,
      client_secret: e.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: MS_SCOPES.join(" "),
    });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500 && isReauthError(body)) throw new ReauthRequiredError("microsoft");
      throw new MailboxProviderError(tokenErrorCode("refresh", body), res.status);
    }
    const accessToken = str(body.access_token);
    if (!accessToken) throw new MailboxProviderError("refresh_failed", res.status);
    if (hasMailRead(body.scope) === false) throw new ReauthRequiredError("microsoft", "mail scope gone");
    // Microsoft rotates the refresh token; the old one may stop working.
    const rotated = str(body.refresh_token);
    return { accessToken, expiresAt: expiresAtOf(body), ...(rotated ? { refreshToken: rotated } : {}) };
  },

  // Microsoft has no endpoint to revoke one delegated refresh token (only
  // all of a user's sessions, which needs admin rights and would sign them
  // out everywhere). Disconnecting deletes the subscription (stopWatch) and
  // our encrypted copy of the token; the user can remove the app's access
  // under account.microsoft.com → Privacy → Apps (personal) or
  // myapps.microsoft.com (work).
  async revoke() {},

  async startWatch(conn, accessToken): Promise<WatchResult> {
    if (conn.watch_id) {
      const expirationDateTime = expiryFromNow();
      const res = await graphSend(accessToken, "PATCH", subscriptionUrl(conn.watch_id), { expirationDateTime });
      if (res.ok) return watchFrom(await readJson(res), conn.watch_id, expirationDateTime);
      // Expired or deleted on Graph's side: a new one.
      if (res.status !== 404) throw new MailboxProviderError("watch_renew_failed", res.status);
    }
    return createSubscription(accessToken);
  },

  async stopWatch(conn, accessToken) {
    if (!conn.watch_id) return;
    const res = await graphSend(accessToken, "DELETE", subscriptionUrl(conn.watch_id));
    // 404: already gone (expired).
    if (!res.ok && res.status !== 404) throw new MailboxProviderError("stop_failed", res.status);
  },

  sync: syncGraph,
};
