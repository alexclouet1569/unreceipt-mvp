// SERVER-ONLY. The Gmail adapter (MailboxProvider, ./types.ts), plain fetch
// against Google's documented REST APIs (no googleapis SDK).
//
//   OAuth   accounts.google.com/o/oauth2/v2/auth (PKCE S256, offline access,
//           prompt=consent so a refresh token always comes back), tokens at
//           oauth2.googleapis.com/token, revocation at …/revoke. Scope:
//           openid email gmail.readonly. A consent without gmail.readonly
//           (Google lets the user untick it) is revoked and refused with
//           MissingScopeError.
//   Push    users.watch on INBOX to the Pub/Sub topic GOOGLE_PUBSUB_TOPIC;
//           Pub/Sub pushes to /api/mailboxes/push/google. A watch lasts 7
//           days; the daily job (/api/cron/mailboxes) renews it.
//   Sync    users.history.list since the stored historyId (messageAdded,
//           INBOX). A historyId too old for Gmail (404) falls back to a
//           search of the last 7 days; so does a connection without one.
//           The first sync after connecting (backfillDays) searches that
//           window instead.
//   Pick    each new message's metadata only (labels, size, Subject, From,
//           attachment names: a partial response, METADATA_FIELDS, no
//           snippet) → isLikelyReceipt() (./select.ts). Only a match is
//           downloaded in full (format=raw) and handed to the shared ingest
//           (ingestReceiptEmail), after a short claim (./claim.ts) so two
//           syncs running at once don't both pay for it. Nothing about
//           other messages is stored. A message whose sizeEstimate (or
//           decoded raw) is over MAX_RAW_BYTES is skipped, as on Outlook.
//   Limits  per connection (mailboxIngest) and per user across all their
//           mailboxes (mailboxIngestUser) before each download; limited,
//           the sync stops with the cursor before the message.
//
// Never logs subjects, addresses, message ids or tokens.

import * as Sentry from "@sentry/nextjs";
import { ingestReceiptEmail } from "@/lib/email/ingest";
import { gmailFilterQuery } from "@/lib/forwarding-filters";
import { CLAUDE_CALL_BUDGET_MS } from "@/lib/ocr";
import { rateLimit } from "@/lib/rate-limit";
import { allowIngestRetry, claimMessage } from "./claim";
import { MAX_RAW_BYTES, decodeHeaderValue, parseRawMessage } from "./raw-message";
import { isLikelyReceipt, MAILBOX_RECEIPT_WORDS } from "./select";
import { isConnectionLive } from "./store";
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

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_SCOPES = ["openid", "email", GMAIL_READONLY_SCOPE] as const;

/** Window searched when the stored historyId is gone or missing. */
export const FALLBACK_DAYS = 7;
/** Full downloads per sync when the caller sets no maxMessages. */
export const DEFAULT_MAX_MESSAGES = 100;
/** Metadata reads per sync, whatever matches: bounds a burst of new mail. */
export const MAX_SCANNED = 1000;
// One more message is started only while an ingest (one Claude call, the
// uploads and the insert) still fits before the caller's deadline.
const MESSAGE_RESERVE_MS = CLAUDE_CALL_BUDGET_MS + 15_000;
// Each provider call is bounded, so one stuck request can't eat the budget.
const CALL_TIMEOUT_MS = 15_000;
const RAW_TIMEOUT_MS = 30_000;
// Metadata reads in flight at once (Gmail allows 250 quota units per user
// per second; a metadata read costs 5).
const METADATA_CONCURRENCY = 5;

function env() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    topic: process.env.GOOGLE_PUBSUB_TOPIC ?? "",
  };
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
    throw new MailboxProviderError("google_unreachable");
  }
}

// ─── OAuth ──────────────────────────────────────────────────────────────

async function tokenRequest(form: Record<string, string>): Promise<{ res: Response; body: Record<string, unknown> }> {
  const res = await call(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { res, body: await readJson(res) };
}

async function revokeToken(token: string): Promise<void> {
  const res = await call(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  if (res.ok) return;
  const body = await readJson(res);
  // Already revoked or expired: nothing left to revoke.
  if (res.status === 400 && (body.error === "invalid_token" || body.error === "invalid_grant")) return;
  throw new MailboxProviderError("revoke_failed", res.status);
}

function grantedScopes(scope: unknown): Set<string> | null {
  return typeof scope === "string" ? new Set(scope.split(/\s+/).filter(Boolean)) : null;
}

async function getProfile(accessToken: string): Promise<{ email: string; historyId: string }> {
  const res = await gmailGet(accessToken, "/profile");
  if (res.status === 403) throw new MissingScopeError("google");
  if (!res.ok) throw new MailboxProviderError("profile_failed", res.status);
  const body = await readJson(res);
  const email = str(body.emailAddress);
  const historyId = historyIdOf(body.historyId);
  if (!email || !historyId) throw new MailboxProviderError("profile_failed", res.status);
  return { email, historyId };
}

// ─── Gmail REST ─────────────────────────────────────────────────────────

function gmailGet(accessToken: string, path: string, params?: URLSearchParams, timeoutMs?: number): Promise<Response> {
  const query = params && [...params.keys()].length > 0 ? `?${params}` : "";
  return call(`${GMAIL_API}${path}${query}`, { headers: { authorization: `Bearer ${accessToken}` } }, timeoutMs);
}

function gmailPost(accessToken: string, path: string, body?: unknown): Promise<Response> {
  return call(`${GMAIL_API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** historyIds are uint64 written as strings (sometimes numbers). */
function historyIdOf(v: unknown): string | null {
  const s = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : typeof v === "string" ? v : "";
  return /^\d{1,20}$/.test(s) ? s : null;
}

/** a > b for historyIds (BigInt: they can pass 2^53). */
export function historyIdAfter(a: string, b: string): boolean {
  return BigInt(a) > BigInt(b);
}

// Gmail answers 429, or 403 with a rate-limit reason, when the user's
// quota is spent: stop and resume on the next sync.
async function isQuotaError(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  const body = await readJson(res.clone());
  const err = isRecord(body.error) ? body.error : {};
  const reasons = Array.isArray(err.errors) ? err.errors.map((e) => (isRecord(e) ? e.reason : null)) : [];
  return reasons.some((r) => r === "rateLimitExceeded" || r === "userRateLimitExceeded");
}

class StopSync extends Error {
  constructor(public readonly reason: "quota") {
    super(reason);
  }
}

async function failOn(res: Response, code: string): Promise<never> {
  if (await isQuotaError(res)) throw new StopSync("quota");
  throw new MailboxProviderError(code, res.status);
}

type PartInfo = { filename?: unknown; mimeType?: unknown; parts?: unknown };

function attachmentNamesOf(payload: unknown, depth = 0, out: string[] = []): string[] {
  if (!isRecord(payload) || depth > 6 || out.length > 50) return out;
  const p = payload as PartInfo;
  const name = str(p.filename);
  if (name) out.push(name.slice(0, 255));
  if (Array.isArray(p.parts)) for (const part of p.parts) attachmentNamesOf(part, depth + 1, out);
  return out;
}

function headerOf(payload: unknown, name: string): string {
  if (!isRecord(payload) || !Array.isArray(payload.headers)) return "";
  for (const h of payload.headers) {
    if (isRecord(h) && typeof h.name === "string" && h.name.toLowerCase() === name.toLowerCase()) {
      return typeof h.value === "string" ? h.value : "";
    }
  }
  return "";
}

// Messages that never were incoming mail, or that the user binned. INBOX
// itself is asked of Gmail (the history's labelId, the search's in:inbox),
// not re-checked here: a receipt archived a second after it arrived still
// counts.
const SKIP_LABELS = new Set(["SPAM", "TRASH", "DRAFT"]);

function readable(labelIds: unknown): boolean {
  if (!Array.isArray(labelIds)) return true;
  return !labelIds.some((l) => typeof l === "string" && SKIP_LABELS.has(l));
}

/**
 * The window search: the mailbox's receipt words (./select.ts) or a PDF, so
 * Gmail itself drops most mail before we read any metadata.
 * isLikelyReceipt() still decides.
 */
export function windowQuery(days: number): string {
  return `in:inbox newer_than:${days}d (${gmailFilterQuery(MAILBOX_RECEIPT_WORDS)} OR filename:pdf)`;
}

/**
 * The only parts of a message's metadata we ask Gmail for (a partial
 * response): its labels, size, the Subject, From and List-Id headers
 * (metadataHeaders; List-Id marks a mailing list or notification feed)
 * and the MIME types and file names of its parts. No snippet, no other
 * header, no body.
 */
export const METADATA_FIELDS =
  "labelIds,sizeEstimate,payload(mimeType,filename,headers(name,value)," +
  "parts(mimeType,filename,parts(mimeType,filename,parts(mimeType,filename,parts(mimeType,filename)))))";

// ─── Push ───────────────────────────────────────────────────────────────

/** { emailAddress, historyId } from a Pub/Sub push body, or null. */
export function parseGmailNotification(body: unknown): { emailAddress: string; historyId: string | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const message = (body as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const data = (message as { data?: unknown }).data;
  if (typeof data !== "string" || data.length === 0 || data.length > 8192) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null) return null;
  const { emailAddress, historyId } = decoded as { emailAddress?: unknown; historyId?: unknown };
  if (typeof emailAddress !== "string" || emailAddress.length === 0) return null;
  const id = typeof historyId === "number" ? String(historyId) : historyId;
  return { emailAddress, historyId: typeof id === "string" && /^\d{1,20}$/.test(id) ? id : null };
}

// ─── One sync ───────────────────────────────────────────────────────────

type MessageOutcome = "skipped" | "duplicate" | "created" | "stop";
type Candidate = { id: string; likely: boolean; tooBig: boolean };

/** Gmail's sizeEstimate (bytes, a number or a numeric string) is over the cap. */
function overSizeCap(sizeEstimate: unknown): boolean {
  const n = typeof sizeEstimate === "number" ? sizeEstimate : typeof sizeEstimate === "string" ? Number(sizeEstimate) : NaN;
  return Number.isFinite(n) && n > MAX_RAW_BYTES;
}
// base64url of MAX_RAW_BYTES, checked before decoding.
const MAX_RAW_BASE64_CHARS = Math.ceil((MAX_RAW_BYTES * 4) / 3) + 4;

class GmailSync {
  processed = 0;
  created = 0;
  scanned = 0;
  stopped = false;
  private windowMode = false;
  private readonly maxMessages: number;
  private readonly seen = new Set<string>();

  constructor(
    private readonly conn: MailboxConnectionRef,
    private readonly accessToken: string,
    private readonly opts: SyncOptions,
  ) {
    this.maxMessages = Math.max(0, opts.maxMessages ?? DEFAULT_MAX_MESSAGES);
  }

  private outOfTime(): boolean {
    return this.opts.deadline !== undefined && Date.now() > this.opts.deadline - MESSAGE_RESERVE_MS;
  }

  /** Metadata for many ids, a few at a time; null = deleted meanwhile or not inbox mail. */
  private async metadata(ids: string[]): Promise<Array<Candidate | null>> {
    const out: Array<Candidate | null> = [];
    for (let i = 0; i < ids.length; i += METADATA_CONCURRENCY) {
      const batch = ids.slice(i, i + METADATA_CONCURRENCY);
      out.push(...(await Promise.all(batch.map((id) => this.isCandidate(id)))));
    }
    return out;
  }

  private async isCandidate(id: string): Promise<Candidate | null> {
    const params = new URLSearchParams({ format: "metadata", fields: METADATA_FIELDS });
    params.append("metadataHeaders", "Subject");
    params.append("metadataHeaders", "From");
    params.append("metadataHeaders", "List-Id");
    const res = await gmailGet(this.accessToken, `/messages/${encodeURIComponent(id)}`, params);
    if (res.status === 404) return null;
    if (!res.ok) await failOn(res, "gmail_message_failed");
    const msg = await readJson(res);
    if (!readable(msg.labelIds)) return null;
    const tooBig = overSizeCap(msg.sizeEstimate);
    const payload = msg.payload;
    const meta = {
      subject: decodeHeaderValue(headerOf(payload, "Subject")),
      from: decodeHeaderValue(headerOf(payload, "From")),
      listId: headerOf(payload, "List-Id"),
      attachmentNames: attachmentNamesOf(payload),
      hasAttachments: false,
    };
    if (isLikelyReceipt(meta)) return { id, likely: true, tooBig };
    // format=metadata may leave out the parts. A message with attachments
    // (multipart/mixed) is asked again for its part names only (a partial
    // response: no bodies are sent).
    const mime = isRecord(payload) && typeof payload.mimeType === "string" ? payload.mimeType.toLowerCase() : "";
    if (meta.attachmentNames.length === 0 && mime === "multipart/mixed") {
      const names = await this.partNames(id);
      return { id, likely: isLikelyReceipt({ ...meta, attachmentNames: names, hasAttachments: names.length > 0 }), tooBig };
    }
    return { id, likely: false, tooBig };
  }

  private async partNames(id: string): Promise<string[]> {
    const params = new URLSearchParams({
      format: "full",
      fields: "payload(filename,parts(filename,parts(filename,parts(filename,parts(filename)))))",
    });
    const res = await gmailGet(this.accessToken, `/messages/${encodeURIComponent(id)}`, params);
    if (res.status === 404) return [];
    if (!res.ok) await failOn(res, "gmail_message_failed");
    return attachmentNamesOf((await readJson(res)).payload);
  }

  /** Reads, picks and ingests a run of message ids in order. */
  private async handleIds(ids: string[]): Promise<MessageOutcome> {
    const fresh = ids.filter((id) => !this.seen.has(id));
    for (const id of fresh) this.seen.add(id);
    // Scan cap reached (never on the first run, so one huge history
    // record can't block the mailbox): nothing of this run counts as done.
    if (this.scanned > 0 && this.scanned + fresh.length > MAX_SCANNED) return "stop";
    if (this.outOfTime()) return "stop";
    this.scanned += fresh.length;
    try {
      const candidates = await this.metadata(fresh);
      for (const c of candidates) {
        // Too big to download and keep as the original: skipped, like a
        // non-receipt (never stored).
        if (!c || !c.likely || c.tooBig) continue;
        const outcome = await this.ingest(c.id);
        if (outcome === "stop") return "stop";
      }
    } catch (err) {
      if (err instanceof StopSync) return "stop";
      throw err;
    }
    return "skipped";
  }

  private async ingest(id: string): Promise<MessageOutcome> {
    if (this.processed >= this.maxMessages || this.outOfTime()) return "stop";
    // Before the download and any Claude call: a flood stops here.
    const limited = await rateLimit("mailboxIngest", this.conn.id);
    if (!limited.ok) return "stop";
    // …and per user: five mailboxes (or a reconnect, which makes a new
    // connection id) must not multiply the ceiling.
    const userLimited = await rateLimit("mailboxIngestUser", this.conn.user_id);
    if (!userLimited.ok) return "stop";
    // Another sync is reading this message right now: leave it to that one.
    // Reading history, stop before it so the cursor can't pass it unread; a
    // window search returns a fixed cursor, so it just goes on.
    if (!(await claimMessage(this.conn.id, id))) return this.windowMode ? "skipped" : "stop";
    // Disconnected (or the account deleted, or paused) since the sync
    // started: not one more download.
    if (!(await isConnectionLive(this.conn.id))) return "stop";

    const res = await gmailGet(
      this.accessToken,
      `/messages/${encodeURIComponent(id)}`,
      new URLSearchParams({ format: "raw" }),
      RAW_TIMEOUT_MS,
    );
    if (res.status === 404) return "skipped";
    if (!res.ok) await failOn(res, "gmail_raw_failed");
    const raw = str((await readJson(res)).raw);
    if (!raw || raw.length > MAX_RAW_BASE64_CHARS) return "skipped";
    const rawEml = Buffer.from(raw, "base64url");
    // sizeEstimate is an estimate: the bytes themselves decide.
    if (rawEml.length === 0 || rawEml.length > MAX_RAW_BYTES) return "skipped";
    this.processed++;

    const parsed = parseRawMessage(rawEml);
    try {
      const result = await ingestReceiptEmail({
        userId: this.conn.user_id,
        source: "mailbox",
        rawEml,
        text: parsed.text,
        html: parsed.html,
        subject: parsed.subject,
        from: parsed.from,
        to: this.conn.email,
        messageId: parsed.messageId,
        trust: mailboxTrust({ rawEml, provider: "google", mailboxEmail: this.conn.email }),
        deadline:
          this.opts.deadline === undefined ? undefined : this.opts.deadline - CLAUDE_CALL_BUDGET_MS - 10_000,
      });
      if (result.kind === "created") {
        this.created++;
        return "created";
      }
      if (result.kind === "duplicate") return "duplicate";
      // Nothing was saved (database or storage blip): stop before this
      // message, so the next sync reads it again; but not forever, or a
      // message that can never be stored would hold the cursor and no
      // later receipt would arrive (allowIngestRetry, ./claim.ts).
      if (await allowIngestRetry(this.conn.id, id)) return "stop";
      Sentry.captureMessage("mailbox message skipped after repeated ingest failures", {
        level: "warning",
        tags: { area: "mailboxes", step: "ingest_retry_exhausted", provider: "google", reason: result.reason },
      });
      return "skipped";
    } catch (err) {
      // A bug, not a blip: retrying would only repeat the paid calls. The
      // message is skipped and reported (no content in the report).
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "ingest", provider: "google" } });
      return "skipped";
    }
  }

  /** Changes since `startHistoryId`; null when Gmail no longer has it (404). */
  async fromHistory(startHistoryId: string): Promise<SyncResult | null> {
    let pageToken: string | null = null;
    let lastDone = startHistoryId;
    let latest: string | null = null;
    do {
      const params = new URLSearchParams({
        startHistoryId,
        historyTypes: "messageAdded",
        labelId: "INBOX",
        maxResults: "500",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await gmailGet(this.accessToken, "/history", params);
      if (res.status === 404) {
        if (pageToken === null) return null;
        throw new MailboxProviderError("gmail_history_failed", 404);
      }
      if (!res.ok) {
        if (await isQuotaError(res)) {
          this.stopped = true;
          break;
        }
        throw new MailboxProviderError("gmail_history_failed", res.status);
      }
      const page = await readJson(res);
      const records = Array.isArray(page.history) ? page.history : [];
      for (const record of records) {
        if (!isRecord(record)) continue;
        const ids: string[] = [];
        for (const added of Array.isArray(record.messagesAdded) ? record.messagesAdded : []) {
          const msg = isRecord(added) && isRecord(added.message) ? added.message : null;
          const id = msg ? str(msg.id) : null;
          if (id && readable(msg!.labelIds)) ids.push(id);
        }
        if (ids.length > 0 && (await this.handleIds(ids)) === "stop") {
          this.stopped = true;
          break;
        }
        const recordId = historyIdOf(record.id);
        if (recordId && historyIdAfter(recordId, lastDone)) lastDone = recordId;
      }
      if (this.stopped) break;
      latest = historyIdOf(page.historyId) ?? latest;
      pageToken = str(page.nextPageToken);
    } while (pageToken);

    if (this.stopped) {
      // Resume after the last history record handled in full.
      return { cursor: lastDone === startHistoryId ? null : lastDone, processed: this.processed, created: this.created };
    }
    const end = latest && historyIdAfter(latest, lastDone) ? latest : lastDone;
    return { cursor: end === startHistoryId ? null : end, processed: this.processed, created: this.created };
  }

  /**
   * The receipt-like inbox mail of the last `days` days, newest first. The
   * cursor returned is `resumeFrom`: changes after it are read by the next
   * sync (messages read here too are recognised by the ingest's dedupe).
   */
  async fromWindow(days: number, resumeFrom: string): Promise<SyncResult> {
    this.windowMode = true;
    let pageToken: string | null = null;
    do {
      const params = new URLSearchParams({ q: windowQuery(days), maxResults: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await gmailGet(this.accessToken, "/messages", params);
      if (!res.ok) {
        if (await isQuotaError(res)) {
          this.stopped = true;
          break;
        }
        throw new MailboxProviderError("gmail_list_failed", res.status);
      }
      const page = await readJson(res);
      const ids = (Array.isArray(page.messages) ? page.messages : [])
        .map((m) => (isRecord(m) ? str(m.id) : null))
        .filter((id): id is string => id !== null);
      if (ids.length > 0 && (await this.handleIds(ids)) === "stop") {
        this.stopped = true;
        break;
      }
      pageToken = str(page.nextPageToken);
    } while (pageToken);
    return { cursor: resumeFrom, processed: this.processed, created: this.created };
  }
}

async function syncGmail(conn: MailboxConnectionRef, accessToken: string, opts: SyncOptions): Promise<SyncResult> {
  const run = new GmailSync(conn, accessToken, opts);
  const cursor = conn.cursor ? historyIdOf(conn.cursor) : null;
  try {
    if (opts.backfillDays && opts.backfillDays > 0) {
      // The watch's historyId (stored at connect) when there is one, so
      // mail arriving during the backfill is read by the next sync.
      const resumeFrom = cursor ?? (await getProfile(accessToken)).historyId;
      return await run.fromWindow(Math.min(Math.floor(opts.backfillDays), 365), resumeFrom);
    }
    if (cursor) {
      const fromHistory = await run.fromHistory(cursor);
      if (fromHistory) return fromHistory;
    }
    // No cursor yet, or Gmail no longer keeps that far back.
    const { historyId } = await getProfile(accessToken);
    return await run.fromWindow(FALLBACK_DAYS, historyId);
  } catch (err) {
    if (err instanceof StopSync) {
      // Quota spent: keep the cursor, the next sync starts over from it.
      return { cursor: null, processed: run.processed, created: run.created };
    }
    throw err;
  }
}

// ─── The adapter ────────────────────────────────────────────────────────

export const googleProvider: MailboxProvider = {
  id: "google",

  configured() {
    const e = env();
    return Boolean(e.clientId && e.clientSecret && e.topic);
  },

  authUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: env().clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${GOOGLE_AUTH_URL}?${params}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }): Promise<ExchangedTokens> {
    const e = env();
    const { res, body } = await tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: e.clientId,
      client_secret: e.clientSecret,
    });
    if (!res.ok) throw new MailboxProviderError("exchange_failed", res.status);
    const accessToken = str(body.access_token);
    const refreshToken = str(body.refresh_token);
    if (!accessToken) throw new MailboxProviderError("exchange_failed", res.status);
    const scopes = grantedScopes(body.scope);
    if (scopes && !scopes.has(GMAIL_READONLY_SCOPE)) {
      // Signed in but no mail access: don't keep a grant we can't use.
      await revokeToken(refreshToken ?? accessToken).catch(() => {});
      throw new MissingScopeError("google");
    }
    if (!refreshToken) {
      await revokeToken(accessToken).catch(() => {});
      throw new MailboxProviderError("no_refresh_token");
    }
    let email: string;
    try {
      email = (await getProfile(accessToken)).email;
    } catch (err) {
      await revokeToken(refreshToken).catch(() => {});
      throw err;
    }
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in) || 3600;
    return { refreshToken, accessToken, expiresAt: Date.now() + expiresIn * 1000, email };
  },

  async refreshAccessToken(refreshToken): Promise<RefreshedAccessToken> {
    const e = env();
    const { res, body } = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: e.clientId,
      client_secret: e.clientSecret,
    });
    // Revoked by the user, expired, or the password changed (for Gmail
    // scopes): only a new consent helps.
    if (res.status === 400 && body.error === "invalid_grant") throw new ReauthRequiredError("google");
    if (!res.ok) throw new MailboxProviderError("refresh_failed", res.status);
    const accessToken = str(body.access_token);
    if (!accessToken) throw new MailboxProviderError("refresh_failed", res.status);
    const scopes = grantedScopes(body.scope);
    if (scopes && !scopes.has(GMAIL_READONLY_SCOPE)) throw new ReauthRequiredError("google", "mail scope gone");
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in) || 3600;
    const rotated = str(body.refresh_token);
    return {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      ...(rotated ? { refreshToken: rotated } : {}),
    };
  },

  canRevoke: true,
  revoke: revokeToken,

  async startWatch(_conn, accessToken): Promise<WatchResult> {
    const topicName = env().topic;
    if (!topicName) throw new MailboxProviderError("push_not_configured");
    const res = await gmailPost(accessToken, "/watch", {
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    });
    if (!res.ok) throw new MailboxProviderError("watch_failed", res.status);
    const body = await readJson(res);
    const historyId = historyIdOf(body.historyId);
    const expiration = Number(body.expiration);
    return {
      watchId: null,
      expiresAt: Number.isFinite(expiration) && expiration > 0 ? new Date(expiration).toISOString() : null,
      cursor: historyId,
    };
  },

  async stopWatch(_conn, accessToken) {
    const res = await gmailPost(accessToken, "/stop");
    // 404: no watch left to stop.
    if (!res.ok && res.status !== 404) throw new MailboxProviderError("stop_failed", res.status);
  },

  sync: syncGmail,
};
