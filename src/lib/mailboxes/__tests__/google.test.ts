// @vitest-environment node
// The Gmail adapter against recorded-shape fake responses of Google's REST
// APIs (OAuth token/revoke, users.getProfile, watch/stop, history.list,
// messages.list/get). The shared ingest and the rate limiter are mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingest: vi.fn(),
  limit: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@/lib/email/ingest", () => ({ ingestReceiptEmail: mocks.ingest }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit }));
vi.mock("@/lib/mailboxes/claim", () => ({ claimMessage: mocks.claim }));

import {
  FALLBACK_DAYS,
  GMAIL_READONLY_SCOPE,
  googleProvider,
  parseGmailNotification,
  windowQuery,
} from "../google";
import { MailboxProviderError, MissingScopeError, ReauthRequiredError, type MailboxConnectionRef } from "../types";

// ─── A fake Google ──────────────────────────────────────────────────────

type FakeMessage = {
  subject: string;
  from?: string;
  labelIds?: string[];
  mimeType?: string;
  /** Part file names, listed by format=metadata. */
  parts?: string[];
  /** Part file names only a format=full partial response lists. */
  hiddenParts?: string[];
  raw?: string;
};

type Call = { method: string; url: URL; body: string | null; auth: string | null };

let calls: Call[];
let messages: Record<string, FakeMessage>;
let historyPages: Array<{ history?: unknown[]; historyId: string; nextPageToken?: string } | { status: number }>;
let listPages: Array<{ messages?: Array<{ id: string }>; nextPageToken?: string } | { status: number }>;
let profileHistoryId: string;
let override: ((call: Call) => Response | undefined) | null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function rawFor(id: string, m: FakeMessage): string {
  if (m.raw) return m.raw;
  return [
    "Authentication-Results: mx.google.com;",
    "       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=uber.com",
    `From: ${m.from ?? "Uber Receipts <noreply@uber.com>"}`,
    "To: anna@gmail.com",
    `Subject: ${m.subject}`,
    `Message-ID: <${id}@mail.example>`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Total 129,00 kr",
    "",
  ].join("\r\n");
}

function respond(call: Call): Response {
  const custom = override?.(call);
  if (custom) return custom;
  const { url } = call;
  if (url.href.startsWith("https://oauth2.googleapis.com/token")) return json({ error: "unexpected" }, 500);
  if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) return new Response(null, { status: 200 });
  const path = url.pathname.replace("/gmail/v1/users/me", "");
  if (path === "/profile") return json({ emailAddress: "Anna@Gmail.com", messagesTotal: 10, historyId: profileHistoryId });
  if (path === "/watch") return json({ historyId: "9000", expiration: "1795000000000" });
  if (path === "/stop") return new Response(null, { status: 204 });
  if (path === "/history") {
    const page = historyPages.shift();
    if (!page) return json({ historyId: profileHistoryId });
    if ("status" in page) return json({ error: { code: page.status } }, page.status);
    return json(page);
  }
  if (path === "/messages") {
    const page = listPages.shift();
    if (!page) return json({ resultSizeEstimate: 0 });
    if ("status" in page) return json({ error: { code: page.status } }, page.status);
    return json(page);
  }
  const m = /^\/messages\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const msg = messages[id];
    if (!msg) return json({ error: { code: 404 } }, 404);
    const format = url.searchParams.get("format");
    if (format === "metadata") {
      const parts = (msg.parts ?? []).map((filename) => ({ partId: "1", mimeType: "application/pdf", filename }));
      return json({
        id,
        threadId: id,
        labelIds: msg.labelIds ?? ["INBOX", "UNREAD"],
        sizeEstimate: 2048,
        payload: {
          mimeType: msg.mimeType ?? "text/plain",
          headers: [
            { name: "From", value: msg.from ?? "Uber Receipts <noreply@uber.com>" },
            { name: "Subject", value: msg.subject },
          ],
          ...(parts.length ? { parts } : {}),
        },
      });
    }
    if (format === "full") {
      return json({ payload: { filename: "", parts: (msg.hiddenParts ?? []).map((filename) => ({ filename })) } });
    }
    if (format === "raw") return json({ id, raw: Buffer.from(rawFor(id, msg), "latin1").toString("base64url") });
  }
  return json({ error: "no route" }, 500);
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const call: Call = {
    method: init?.method ?? "GET",
    url: new URL(String(input)),
    body: typeof init?.body === "string" ? init.body : null,
    auth: headers.get("authorization"),
  };
  calls.push(call);
  return respond(call);
});

const rawFetches = () =>
  calls.filter((c) => c.url.searchParams.get("format") === "raw").map((c) => c.url.pathname.split("/").pop());
const metadataFetches = () => calls.filter((c) => c.url.searchParams.get("format") === "metadata").length;

const CONN: MailboxConnectionRef = {
  id: "conn-1",
  user_id: "11111111-1111-4111-8111-111111111111",
  provider: "google",
  email: "anna@gmail.com",
  status: "active",
  cursor: "1000",
  watch_id: null,
  watch_expires_at: "2026-11-20T00:00:00.000Z",
  last_sync_at: null,
  last_receipt_at: null,
  last_error: null,
  created_at: "2026-11-13T00:00:00.000Z",
  updated_at: "2026-11-13T00:00:00.000Z",
};

const record = (id: string, ...msgIds: string[]) => ({
  id,
  messages: msgIds.map((m) => ({ id: m, threadId: m })),
  messagesAdded: msgIds.map((m) => ({ message: { id: m, threadId: m, labelIds: ["INBOX", "UNREAD"] } })),
});

beforeEach(() => {
  calls = [];
  messages = {};
  historyPages = [];
  listPages = [];
  profileHistoryId = "5000";
  override = null;
  vi.stubGlobal("fetch", fetchMock);
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_PUBSUB_TOPIC = "projects/unreceipt/topics/gmail-push";
  mocks.ingest.mockReset();
  mocks.ingest.mockImplementation(async () => ({ kind: "created", receiptId: "r1", status: "pending_review" }));
  mocks.limit.mockReset();
  mocks.limit.mockResolvedValue({ ok: true });
  mocks.claim.mockReset();
  mocks.claim.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── OAuth ──────────────────────────────────────────────────────────────

describe("configured / authUrl", () => {
  it("needs the client id, secret and Pub/Sub topic", () => {
    expect(googleProvider.configured()).toBe(true);
    delete process.env.GOOGLE_PUBSUB_TOPIC;
    expect(googleProvider.configured()).toBe(false);
  });

  it("asks for offline Gmail read access with PKCE", () => {
    const url = new URL(
      googleProvider.authUrl({ state: "st", codeChallenge: "ch", redirectUri: "https://app.unreceipt.com/cb" }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-id.apps.googleusercontent.com",
      redirect_uri: "https://app.unreceipt.com/cb",
      response_type: "code",
      scope: `openid email ${GMAIL_READONLY_SCOPE}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });
});

describe("exchangeCode", () => {
  const tokenOk = (scope = `openid ${GMAIL_READONLY_SCOPE} https://www.googleapis.com/auth/userinfo.email`) =>
    (call: Call) =>
      call.url.href === "https://oauth2.googleapis.com/token"
        ? json({
            access_token: "ya29.at",
            expires_in: 3599,
            refresh_token: "1//rt",
            scope,
            token_type: "Bearer",
            id_token: "x.y.z",
          })
        : undefined;

  it("posts the code with the PKCE verifier and reads the address from the profile", async () => {
    override = tokenOk();
    const before = Date.now();
    const out = await googleProvider.exchangeCode({ code: "4/abc", codeVerifier: "ver", redirectUri: "https://app/cb" });
    expect(out).toMatchObject({ refreshToken: "1//rt", accessToken: "ya29.at", email: "Anna@Gmail.com" });
    expect(out.expiresAt).toBeGreaterThanOrEqual(before + 3599_000);
    const form = new URLSearchParams(calls[0].body ?? "");
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "authorization_code",
      code: "4/abc",
      code_verifier: "ver",
      redirect_uri: "https://app/cb",
      client_id: "client-id.apps.googleusercontent.com",
      client_secret: "client-secret",
    });
    expect(calls[1].url.pathname).toBe("/gmail/v1/users/me/profile");
    expect(calls[1].auth).toBe("Bearer ya29.at");
  });

  it("revokes and refuses a consent without the Gmail scope", async () => {
    override = tokenOk("openid https://www.googleapis.com/auth/userinfo.email");
    await expect(
      googleProvider.exchangeCode({ code: "4/abc", codeVerifier: "v", redirectUri: "https://app/cb" }),
    ).rejects.toBeInstanceOf(MissingScopeError);
    const revoke = calls.find((c) => c.url.href === "https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(revoke?.body ?? "").get("token")).toBe("1//rt");
    expect(calls.some((c) => c.url.pathname.endsWith("/profile"))).toBe(false);
  });

  it("fails with a short code when Google refuses the code", async () => {
    override = (call) =>
      call.url.href.includes("/token") ? json({ error: "invalid_grant", error_description: "Bad Request" }, 400) : undefined;
    const err = await googleProvider
      .exchangeCode({ code: "x", codeVerifier: "v", redirectUri: "https://app/cb" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailboxProviderError);
    expect(err).toMatchObject({ code: "exchange_failed", status: 400 });
  });
});

describe("refreshAccessToken / revoke", () => {
  it("returns a fresh access token", async () => {
    override = (call) =>
      call.url.href.includes("/token")
        ? json({ access_token: "ya29.new", expires_in: 3599, scope: GMAIL_READONLY_SCOPE, token_type: "Bearer" })
        : undefined;
    const out = await googleProvider.refreshAccessToken("1//rt");
    expect(out.accessToken).toBe("ya29.new");
    expect(out.refreshToken).toBeUndefined();
    expect(new URLSearchParams(calls[0].body ?? "").get("grant_type")).toBe("refresh_token");
  });

  it("maps invalid_grant to ReauthRequiredError, anything else to a transient error", async () => {
    override = (call) => (call.url.href.includes("/token") ? json({ error: "invalid_grant" }, 400) : undefined);
    await expect(googleProvider.refreshAccessToken("1//rt")).rejects.toBeInstanceOf(ReauthRequiredError);
    override = (call) => (call.url.href.includes("/token") ? json({ error: "internal_failure" }, 503) : undefined);
    const err = await googleProvider.refreshAccessToken("1//rt").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailboxProviderError);
    expect(err).not.toBeInstanceOf(ReauthRequiredError);
  });

  it("revokes, and treats an already revoked token as done", async () => {
    await googleProvider.revoke("1//rt");
    override = (call) => (call.url.href.includes("/revoke") ? json({ error: "invalid_token" }, 400) : undefined);
    await expect(googleProvider.revoke("1//rt")).resolves.toBeUndefined();
    override = (call) => (call.url.href.includes("/revoke") ? json({}, 500) : undefined);
    await expect(googleProvider.revoke("1//rt")).rejects.toBeInstanceOf(MailboxProviderError);
  });
});

// ─── Push ───────────────────────────────────────────────────────────────

describe("startWatch / stopWatch", () => {
  it("watches INBOX on the configured topic and returns the expiry and historyId", async () => {
    const watch = await googleProvider.startWatch(CONN, "ya29.at");
    expect(watch).toEqual({ watchId: null, expiresAt: new Date(1795000000000).toISOString(), cursor: "9000" });
    expect(calls[0]).toMatchObject({ method: "POST", auth: "Bearer ya29.at" });
    expect(calls[0].url.href).toBe("https://gmail.googleapis.com/gmail/v1/users/me/watch");
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      topicName: "projects/unreceipt/topics/gmail-push",
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    });
  });

  it("fails clearly without a topic or on a refusal", async () => {
    delete process.env.GOOGLE_PUBSUB_TOPIC;
    await expect(googleProvider.startWatch(CONN, "at")).rejects.toMatchObject({ code: "push_not_configured" });
    process.env.GOOGLE_PUBSUB_TOPIC = "projects/p/topics/t";
    override = (call) => (call.url.pathname.endsWith("/watch") ? json({ error: {} }, 403) : undefined);
    await expect(googleProvider.startWatch(CONN, "at")).rejects.toMatchObject({ code: "watch_failed", status: 403 });
  });

  it("stops the watch", async () => {
    await googleProvider.stopWatch(CONN, "ya29.at");
    expect(calls[0].url.href).toBe("https://gmail.googleapis.com/gmail/v1/users/me/stop");
    expect(calls[0].method).toBe("POST");
  });

  it("reads a Pub/Sub notification", () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: "anna@gmail.com", historyId: 9876543210 })).toString("base64");
    expect(parseGmailNotification({ message: { data, messageId: "1" }, subscription: "s" })).toEqual({
      emailAddress: "anna@gmail.com",
      historyId: "9876543210",
    });
    expect(parseGmailNotification({ message: { data: "!!" } })).toBeNull();
    expect(parseGmailNotification({})).toBeNull();
  });
});

// ─── Sync ───────────────────────────────────────────────────────────────

describe("sync from history", () => {
  it("reads every page, downloads only receipt-like mail and moves the cursor to the latest historyId", async () => {
    messages = {
      m1: { subject: "Your Wednesday trip with Uber" },
      m2: { subject: "Team lunch on Friday?", from: "colleague@acme.se" },
      m3: { subject: "Ditt kvitto från Butik", from: "kvitto@butik.se" },
    };
    historyPages = [
      { history: [record("1001", "m1"), record("1002", "m2")], historyId: "1010", nextPageToken: "p2" },
      { history: [record("1003", "m3")], historyId: "1012" },
    ];
    const out = await googleProvider.sync(CONN, "ya29.at", {});
    expect(out).toEqual({ cursor: "1012", processed: 2, created: 2 });
    expect(rawFetches()).toEqual(["m1", "m3"]);
    expect(metadataFetches()).toBe(3);

    const first = calls.find((c) => c.url.pathname.endsWith("/history"))!;
    expect(Object.fromEntries(first.url.searchParams)).toMatchObject({
      startHistoryId: "1000",
      historyTypes: "messageAdded",
      labelId: "INBOX",
    });
    expect(calls.filter((c) => c.url.pathname.endsWith("/history"))[1].url.searchParams.get("pageToken")).toBe("p2");
    // Metadata asks for Subject and From only.
    const meta = calls.find((c) => c.url.searchParams.get("format") === "metadata")!;
    expect(meta.url.searchParams.getAll("metadataHeaders")).toEqual(["Subject", "From"]);
  });

  it("hands the shared ingest the raw message, its fields and the trust verdict", async () => {
    messages = { m1: { subject: "Your Wednesday trip with Uber" } };
    historyPages = [{ history: [record("1001", "m1")], historyId: "1001" }];
    await googleProvider.sync(CONN, "ya29.at", { deadline: Date.now() + 280_000 });
    expect(mocks.limit).toHaveBeenCalledWith("mailboxIngest", "conn-1");
    expect(mocks.ingest).toHaveBeenCalledTimes(1);
    const input = mocks.ingest.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: CONN.user_id,
      source: "mailbox",
      subject: "Your Wednesday trip with Uber",
      from: "noreply@uber.com",
      to: "anna@gmail.com",
      messageId: "<m1@mail.example>",
      text: "Total 129,00 kr\r\n",
      html: null,
      trust: { dmarc: "pass", recipient: { from: "given", ownership: "personal" } },
    });
    expect(Buffer.isBuffer(input.rawEml)).toBe(true);
    expect(input.rawEml.toString("latin1")).toContain("Subject: Your Wednesday trip with Uber");
    expect(input.deadline).toBeLessThan(Date.now() + 280_000);
  });

  it("reads each message once and skips spam, trash and drafts", async () => {
    messages = {
      m1: { subject: "Receipt" },
      m2: { subject: "Receipt", labelIds: ["SPAM"] },
    };
    historyPages = [{ history: [record("1001", "m1"), record("1002", "m1", "m2")], historyId: "1002" }];
    const out = await googleProvider.sync(CONN, "at", {});
    expect(rawFetches()).toEqual(["m1"]);
    expect(out.cursor).toBe("1002");
  });

  it("skips a message deleted before it was read", async () => {
    historyPages = [{ history: [record("1001", "gone")], historyId: "1001" }];
    expect(await googleProvider.sync(CONN, "at", {})).toEqual({ cursor: "1001", processed: 0, created: 0 });
  });

  it("asks for attachment names when the metadata leaves them out", async () => {
    messages = {
      m1: { subject: "Dina dokument", mimeType: "multipart/mixed", hiddenParts: ["Faktura_2026-11.pdf"] },
      m2: { subject: "Semesterbilder", mimeType: "multipart/mixed", hiddenParts: ["strand.jpg"] },
      m3: { subject: "Your documents", parts: ["receipt-123.pdf"] },
    };
    historyPages = [{ history: [record("1001", "m1", "m2", "m3")], historyId: "1001" }];
    await googleProvider.sync(CONN, "at", {});
    expect(rawFetches()).toEqual(["m1", "m3"]);
    const full = calls.filter((c) => c.url.searchParams.get("format") === "full");
    expect(full).toHaveLength(2);
    expect(full[0].url.searchParams.get("fields")).toMatch(/^payload\(filename,parts\(filename/);
  });

  it("keeps the cursor and creates nothing when there is nothing new", async () => {
    historyPages = [{ historyId: "1000" }];
    expect(await googleProvider.sync(CONN, "at", {})).toEqual({ cursor: null, processed: 0, created: 0 });
  });

  it("counts duplicates as processed but not created", async () => {
    messages = { m1: { subject: "Receipt" } };
    historyPages = [{ history: [record("1001", "m1")], historyId: "1001" }];
    mocks.ingest.mockResolvedValueOnce({ kind: "duplicate", receiptId: "r0" });
    expect(await googleProvider.sync(CONN, "at", {})).toEqual({ cursor: "1001", processed: 1, created: 0 });
  });

  it("falls back to the last 7 days when Gmail no longer has the historyId", async () => {
    historyPages = [{ status: 404 }];
    messages = { m9: { subject: "Kvitto" } };
    listPages = [{ messages: [{ id: "m9" }] }];
    profileHistoryId = "7777";
    const out = await googleProvider.sync(CONN, "at", {});
    expect(out).toEqual({ cursor: "7777", processed: 1, created: 1 });
    const list = calls.find((c) => c.url.pathname.endsWith("/messages"))!;
    expect(list.url.searchParams.get("q")).toBe(windowQuery(FALLBACK_DAYS));
    expect(list.url.searchParams.get("q")).toMatch(/^in:inbox newer_than:7d \(subject:\(receipt OR .* OR filename:pdf\)$/);
  });

  it("reads the last 7 days when the connection has no cursor yet", async () => {
    listPages = [{ messages: [] }];
    profileHistoryId = "4242";
    const out = await googleProvider.sync({ ...CONN, cursor: null }, "at", {});
    expect(out.cursor).toBe("4242");
    expect(calls.some((c) => c.url.pathname.endsWith("/history"))).toBe(false);
  });

  it("stops at the rate limit and resumes after the last record done", async () => {
    messages = { m1: { subject: "Receipt 1" }, m2: { subject: "Receipt 2" }, m3: { subject: "Receipt 3" } };
    historyPages = [{ history: [record("1001", "m1"), record("1002", "m2"), record("1003", "m3")], historyId: "1003" }];
    mocks.limit.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, retryAfterSeconds: 60 });
    const out = await googleProvider.sync(CONN, "at", {});
    expect(out).toEqual({ cursor: "1001", processed: 1, created: 1 });
    expect(rawFetches()).toEqual(["m1"]);
    expect(mocks.ingest).toHaveBeenCalledTimes(1);
  });

  it("stops before a message another sync is reading, without downloading it", async () => {
    messages = { m1: { subject: "Receipt 1" }, m2: { subject: "Receipt 2" } };
    historyPages = [{ history: [record("1001", "m1"), record("1002", "m2")], historyId: "1002" }];
    mocks.claim.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await googleProvider.sync(CONN, "at", {})).toEqual({ cursor: "1001", processed: 1, created: 1 });
    expect(mocks.claim).toHaveBeenCalledWith("conn-1", "m2");
    expect(rawFetches()).toEqual(["m1"]);
  });

  it("stops before a message the ingest couldn't save, so it is read again", async () => {
    messages = { m1: { subject: "Receipt 1" }, m2: { subject: "Receipt 2" } };
    historyPages = [{ history: [record("1001", "m1"), record("1002", "m2")], historyId: "1002" }];
    mocks.ingest
      .mockResolvedValueOnce({ kind: "created", receiptId: "r1", status: "pending_review" })
      .mockResolvedValueOnce({ kind: "retry", reason: "upload_failed" });
    expect(await googleProvider.sync(CONN, "at", {})).toEqual({ cursor: "1001", processed: 2, created: 1 });
  });

  it("stops without moving the cursor when Gmail's quota is spent", async () => {
    messages = { m1: { subject: "Receipt" } };
    historyPages = [{ history: [record("1001", "m1")], historyId: "1001" }];
    override = (call) => (call.url.searchParams.get("format") === "metadata" ? json({ error: { code: 429 } }, 429) : undefined);
    expect(await googleProvider.sync(CONN, "at", {})).toEqual({ cursor: null, processed: 0, created: 0 });
  });

  it("throws a short code on any other Gmail failure", async () => {
    historyPages = [{ status: 500 }];
    await expect(googleProvider.sync(CONN, "at", {})).rejects.toMatchObject({ code: "gmail_history_failed", status: 500 });
  });

  it("starts nothing once the deadline is near", async () => {
    messages = { m1: { subject: "Receipt" } };
    historyPages = [{ history: [record("1001", "m1")], historyId: "1001" }];
    const out = await googleProvider.sync(CONN, "at", { deadline: Date.now() + 5_000 });
    expect(out).toEqual({ cursor: null, processed: 0, created: 0 });
    expect(metadataFetches()).toBe(0);
  });

  it("skips (and reports) a message the ingest threw on, instead of retrying it forever", async () => {
    messages = { m1: { subject: "Receipt 1" }, m2: { subject: "Receipt 2" } };
    historyPages = [{ history: [record("1001", "m1"), record("1002", "m2")], historyId: "1002" }];
    mocks.ingest.mockRejectedValueOnce(new Error("bug"));
    expect(await googleProvider.sync(CONN, "at", {})).toEqual({ cursor: "1002", processed: 2, created: 1 });
  });
});

describe("backfill", () => {
  const page = (ids: string[], next?: string) => ({ messages: ids.map((id) => ({ id, threadId: id })), ...(next ? { nextPageToken: next } : {}) });

  it("searches the window page by page and stops at maxMessages, keeping the watch's cursor", async () => {
    for (let i = 1; i <= 6; i++) messages[`b${i}`] = { subject: `Receipt ${i}` };
    listPages = [page(["b1", "b2"], "n2"), page(["b3", "b4"], "n3"), page(["b5", "b6"])];
    const out = await googleProvider.sync(CONN, "at", { backfillDays: 30, maxMessages: 3 });
    expect(out).toEqual({ cursor: "1000", processed: 3, created: 3 });
    expect(rawFetches()).toEqual(["b1", "b2", "b3"]);
    const lists = calls.filter((c) => c.url.pathname.endsWith("/messages"));
    expect(lists).toHaveLength(2);
    expect(lists[0].url.searchParams.get("q")).toBe(windowQuery(30));
    expect(lists[1].url.searchParams.get("pageToken")).toBe("n2");
    expect(calls.some((c) => c.url.pathname.endsWith("/history"))).toBe(false);
  });

  it("reads every page when under maxMessages", async () => {
    messages = { b1: { subject: "Receipt" }, b2: { subject: "Newsletter" }, b3: { subject: "Kvitto" } };
    listPages = [page(["b1", "b2"], "n2"), page(["b3"])];
    const out = await googleProvider.sync(CONN, "at", { backfillDays: 30, maxMessages: 100 });
    expect(out).toEqual({ cursor: "1000", processed: 2, created: 2 });
  });

  it("leaves a message another sync is reading to it and goes on", async () => {
    messages = { b1: { subject: "Receipt" }, b2: { subject: "Kvitto" } };
    listPages = [page(["b1", "b2"])];
    mocks.claim.mockResolvedValueOnce(false);
    const out = await googleProvider.sync(CONN, "at", { backfillDays: 30, maxMessages: 100 });
    expect(out).toEqual({ cursor: "1000", processed: 1, created: 1 });
    expect(rawFetches()).toEqual(["b2"]);
  });

  it("starts from the profile's historyId when the watch didn't store one", async () => {
    listPages = [page([])];
    profileHistoryId = "8080";
    const out = await googleProvider.sync({ ...CONN, cursor: null }, "at", { backfillDays: 30, maxMessages: 100 });
    expect(out.cursor).toBe("8080");
    // The profile is read before the search, so nothing arriving meanwhile is skipped.
    const order = calls.map((c) => c.url.pathname.split("/").pop());
    expect(order.indexOf("profile")).toBeLessThan(order.indexOf("messages"));
  });
});
