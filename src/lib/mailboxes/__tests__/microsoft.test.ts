// @vitest-environment node
// The Outlook adapter against fake responses shaped like Microsoft's
// documented REST APIs (identity platform v2.0 token endpoint, Graph /me,
// subscriptions, message delta, message list, attachments, /$value). The
// shared ingest, the rate limiter and the per-message claim are mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingest: vi.fn(),
  limit: vi.fn(),
  claim: vi.fn(),
  retry: vi.fn(),
  live: vi.fn(),
}));
vi.mock("@/lib/email/ingest", () => ({ ingestReceiptEmail: mocks.ingest }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit }));
vi.mock("@/lib/mailboxes/claim", () => ({ claimMessage: mocks.claim, allowIngestRetry: mocks.retry }));
vi.mock("@/lib/mailboxes/store", () => ({ isConnectionLive: mocks.live }));

import {
  acceptedSubscriptions,
  clientStateMatches,
  decodeCursor,
  encodeCursor,
  initialDeltaUrl,
  isGraphMeUrl,
  microsoftProvider,
  SINCE_SLACK_MS,
  SUBSCRIPTION_MINUTES,
} from "../microsoft";
import { MailboxProviderError, MissingScopeError, ReauthRequiredError, type MailboxConnectionRef } from "../types";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const G = "https://graph.microsoft.com/v1.0";
const DELTA_BASE = `${G}/me/mailFolders('inbox')/messages/delta`;
const STATE = "client-state-0123456789abcdef";

// ─── A fake Microsoft ───────────────────────────────────────────────────

type Call = { method: string; url: URL; href: string; body: string | null; auth: string | null; prefer: string | null };

type Msg = {
  subject: string;
  from?: string;
  received?: string;
  hasAttachments?: boolean;
  attachments?: string[];
  removed?: boolean;
};

let calls: Call[];
let messages: Record<string, Msg>;
/** Delta pages by key: "initial", "skip:<token>", "delta:<token>". */
let deltaPages: Record<string, { ids: string[]; next?: string; delta?: string } | { status: number; code?: string }>;
/** List pages by key: "first", "skip:<token>". */
let listPages: Record<string, { ids: string[]; next?: string } | { status: number }>;
let override: ((call: Call) => Response | undefined) | null;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const graphError = (status: number, code: string) => json({ error: { code, message: "x" } }, status);

function rowJson(id: string) {
  const m = messages[id];
  if (m.removed) return { "@odata.type": "#microsoft.graph.message", id, "@removed": { reason: "deleted" } };
  return {
    "@odata.type": "#microsoft.graph.message",
    "@odata.etag": 'W/"x"',
    id,
    receivedDateTime: m.received ?? "2026-11-13T11:30:00Z",
    hasAttachments: m.hasAttachments ?? false,
    internetMessageId: `<${id}@mail.example>`,
    subject: m.subject,
    from: { emailAddress: { name: "Uber Receipts", address: m.from ?? "noreply@uber.com" } },
  };
}

function rawFor(id: string): string {
  const m = messages[id];
  return [
    "Authentication-Results: spf=pass smtp.mailfrom=uber.com; dkim=pass header.d=uber.com; dmarc=pass action=none header.from=uber.com;",
    `From: Uber Receipts <${m.from ?? "noreply@uber.com"}>`,
    "To: anna@outlook.com",
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
  const { url, method } = call;
  if (url.host === "login.microsoftonline.com") return json({ error: "unexpected" }, 500);
  const path = decodeURIComponent(url.pathname);
  if (path === "/v1.0/me") return json({ mail: null, userPrincipalName: "Anna@Outlook.com" });
  if (path === "/v1.0/me/mailFolders/inbox") return json({ id: "AAMkInbox" });
  if (path === "/v1.0/subscriptions" && method === "POST") {
    const body = JSON.parse(call.body ?? "{}");
    return json({ id: "11111111-2222-3333-4444-555555555555", expirationDateTime: body.expirationDateTime, clientState: null }, 201);
  }
  const sub = /^\/v1\.0\/subscriptions\/([^/]+)$/.exec(path);
  if (sub && method === "PATCH") {
    return json({ id: sub[1], expirationDateTime: JSON.parse(call.body ?? "{}").expirationDateTime });
  }
  if (sub && method === "DELETE") return new Response(null, { status: 204 });

  if (path.endsWith("/messages/delta")) {
    const skip = url.searchParams.get("$skiptoken");
    const delta = url.searchParams.get("$deltatoken");
    const key = skip ? `skip:${skip}` : delta ? `delta:${delta}` : "initial";
    const page = deltaPages[key];
    if (!page) return json({ value: [], "@odata.deltaLink": `${DELTA_BASE}?$deltatoken=empty` });
    if ("status" in page) return graphError(page.status, page.code ?? "Error");
    return json({
      "@odata.context": "x",
      value: page.ids.map(rowJson),
      ...(page.next ? { "@odata.nextLink": `${DELTA_BASE}?$skiptoken=${page.next}` } : {}),
      ...(page.delta ? { "@odata.deltaLink": `${DELTA_BASE}?$deltatoken=${page.delta}` } : {}),
    });
  }
  if (path === "/v1.0/me/mailFolders/inbox/messages") {
    const skip = url.searchParams.get("$skiptoken");
    const page = listPages[skip ? `skip:${skip}` : "first"];
    if (!page) return json({ value: [] });
    if ("status" in page) return graphError(page.status, "Error");
    return json({
      value: page.ids.map(rowJson),
      ...(page.next ? { "@odata.nextLink": `${G}/me/mailFolders/inbox/messages?$skiptoken=${page.next}` } : {}),
    });
  }
  const att = /^\/v1\.0\/me\/messages\/([^/]+)\/attachments$/.exec(path);
  if (att) {
    const m = messages[att[1]];
    if (!m) return graphError(404, "ErrorItemNotFound");
    return json({ value: (m.attachments ?? []).map((name) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name, contentType: "application/pdf" })) });
  }
  const raw = /^\/v1\.0\/me\/messages\/([^/]+)\/\$value$/.exec(path);
  if (raw) {
    if (!messages[raw[1]]) return graphError(404, "ErrorItemNotFound");
    return new Response(Buffer.from(rawFor(raw[1]), "latin1"), { status: 200, headers: { "content-type": "text/plain" } });
  }
  return json({ error: "no route" }, 500);
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const href = String(input);
  const call: Call = {
    method: init?.method ?? "GET",
    url: new URL(href),
    href,
    body: typeof init?.body === "string" ? init.body : null,
    auth: headers.get("authorization"),
    prefer: headers.get("prefer"),
  };
  calls.push(call);
  return respond(call);
});

const rawFetches = () =>
  calls.filter((c) => c.url.pathname.endsWith("/$value")).map((c) => decodeURIComponent(c.url.pathname.split("/")[4]));
const attachmentFetches = () =>
  calls.filter((c) => c.url.pathname.endsWith("/attachments")).map((c) => decodeURIComponent(c.url.pathname.split("/")[4]));
const deltaCalls = () => calls.filter((c) => c.url.pathname.endsWith("/messages/delta"));

const CONN: MailboxConnectionRef = {
  id: "conn-1",
  user_id: "11111111-1111-4111-8111-111111111111",
  provider: "microsoft",
  email: "anna@outlook.com",
  status: "active",
  cursor: null,
  watch_id: null,
  watch_expires_at: null,
  last_sync_at: null,
  last_receipt_at: null,
  last_error: null,
  created_at: "2026-11-13T11:00:00.000Z",
  updated_at: "2026-11-13T11:00:00.000Z",
};

const storedCursor = (token: string, since = "2026-11-13T09:00:00.000Z") =>
  encodeCursor({ link: `${DELTA_BASE}?$deltatoken=${token}`, since });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  calls = [];
  messages = {};
  deltaPages = {};
  listPages = {};
  override = null;
  vi.stubGlobal("fetch", fetchMock);
  process.env.MS_OAUTH_CLIENT_ID = "00000000-aaaa-bbbb-cccc-000000000000";
  process.env.MS_OAUTH_CLIENT_SECRET = "secret~value";
  process.env.MS_GRAPH_CLIENT_STATE = STATE;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.unreceipt.com";
  mocks.ingest.mockReset();
  mocks.ingest.mockImplementation(async () => ({ kind: "created", receiptId: "r1", status: "pending_review" }));
  mocks.limit.mockReset();
  mocks.limit.mockResolvedValue({ ok: true });
  mocks.claim.mockReset();
  mocks.claim.mockResolvedValue(true);
  mocks.retry.mockReset();
  mocks.retry.mockResolvedValue(true);
  mocks.live.mockReset();
  mocks.live.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── OAuth ──────────────────────────────────────────────────────────────

describe("configured / authUrl", () => {
  it("needs the client id, secret and a usable clientState", () => {
    expect(microsoftProvider.configured()).toBe(true);
    process.env.MS_GRAPH_CLIENT_STATE = "short";
    expect(microsoftProvider.configured()).toBe(false);
    process.env.MS_GRAPH_CLIENT_STATE = "x".repeat(129);
    expect(microsoftProvider.configured()).toBe(false);
    process.env.MS_GRAPH_CLIENT_STATE = STATE;
    delete process.env.MS_OAUTH_CLIENT_SECRET;
    expect(microsoftProvider.configured()).toBe(false);
  });

  it("asks /common for offline mail read access with PKCE", () => {
    const url = new URL(
      microsoftProvider.authUrl({ state: "st", codeChallenge: "ch", redirectUri: "https://app.unreceipt.com/cb" }),
    );
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "00000000-aaaa-bbbb-cccc-000000000000",
      response_type: "code",
      redirect_uri: "https://app.unreceipt.com/cb",
      response_mode: "query",
      scope: "openid email offline_access User.Read Mail.Read",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });
});

const tokenOk =
  (extra: Record<string, unknown> = {}) =>
  (call: Call) =>
    call.url.host === "login.microsoftonline.com"
      ? json({
          token_type: "Bearer",
          scope: "email Mail.Read openid profile User.Read",
          expires_in: 3599,
          ext_expires_in: 3599,
          access_token: "eyJ.at",
          refresh_token: "M.C5.rt",
          id_token: "x.y.z",
          ...extra,
        })
      : undefined;

describe("exchangeCode", () => {
  it("posts the code with the verifier; a null mail falls back to the sign-in name", async () => {
    override = tokenOk();
    const out = await microsoftProvider.exchangeCode({ code: "M.code", codeVerifier: "ver", redirectUri: "https://app/cb" });
    expect(out).toEqual({ refreshToken: "M.C5.rt", accessToken: "eyJ.at", expiresAt: NOW + 3599_000, email: "Anna@Outlook.com" });
    expect(calls[0].href).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(Object.fromEntries(new URLSearchParams(calls[0].body ?? ""))).toEqual({
      client_id: "00000000-aaaa-bbbb-cccc-000000000000",
      client_secret: "secret~value",
      grant_type: "authorization_code",
      code: "M.code",
      code_verifier: "ver",
      redirect_uri: "https://app/cb",
      scope: "openid email offline_access User.Read Mail.Read",
    });
    expect(calls[1].url.pathname).toBe("/v1.0/me");
    expect(calls[1].url.searchParams.get("$select")).toBe("mail,userPrincipalName");
    expect(calls[1].auth).toBe("Bearer eyJ.at");
    // The mailbox exists.
    expect(calls[2].url.pathname).toBe("/v1.0/me/mailFolders/inbox");
  });

  it("prefers mail over the sign-in name, and refuses a guest name", async () => {
    override = (call) =>
      tokenOk()(call) ?? (call.url.pathname === "/v1.0/me" ? json({ mail: "Anna.S@Acme.se", userPrincipalName: "as@acme.onmicrosoft.com" }) : undefined);
    expect((await microsoftProvider.exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" })).email).toBe("Anna.S@Acme.se");
    override = (call) =>
      tokenOk()(call) ??
      (call.url.pathname === "/v1.0/me" ? json({ mail: null, userPrincipalName: "anna_gmail.com#EXT#@acme.onmicrosoft.com" }) : undefined);
    await expect(microsoftProvider.exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" })).rejects.toMatchObject({
      code: "profile_failed",
    });
  });

  it("refuses a grant without Mail.Read, and an account without a mailbox", async () => {
    override = tokenOk({ scope: "openid profile User.Read" });
    await expect(microsoftProvider.exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" })).rejects.toBeInstanceOf(
      MissingScopeError,
    );
    override = (call) =>
      tokenOk()(call) ?? (call.url.pathname === "/v1.0/me/mailFolders/inbox" ? graphError(404, "MailboxNotEnabledForRESTAPI") : undefined);
    await expect(microsoftProvider.exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" })).rejects.toMatchObject({
      code: "no_mailbox",
      status: 404,
    });
  });

  it("needs a refresh token (offline_access) and fails with a short code on a refusal", async () => {
    override = tokenOk({ refresh_token: undefined });
    await expect(microsoftProvider.exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" })).rejects.toMatchObject({
      code: "no_refresh_token",
    });
    override = (call) =>
      call.url.host === "login.microsoftonline.com"
        ? json({ error: "invalid_grant", error_description: "AADSTS54005: OAuth2 Authorization code was already redeemed" }, 400)
        : undefined;
    const err = await microsoftProvider.exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailboxProviderError);
    expect(err).toMatchObject({ code: "exchange_failed", status: 400 });
  });
});

describe("refreshAccessToken / revoke", () => {
  it("returns the rotated refresh token", async () => {
    override = tokenOk({ access_token: "eyJ.new", refresh_token: "M.C5.rotated" });
    const out = await microsoftProvider.refreshAccessToken("M.C5.rt");
    expect(out).toEqual({ accessToken: "eyJ.new", expiresAt: NOW + 3599_000, refreshToken: "M.C5.rotated" });
    const form = new URLSearchParams(calls[0].body ?? "");
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("M.C5.rt");
    expect(form.get("scope")).toBe("openid email offline_access User.Read Mail.Read");
  });

  it.each([
    [{ error: "invalid_grant", error_description: "AADSTS70008: The provided authorization code or refresh token has expired" }],
    [{ error: "invalid_grant", error_description: "AADSTS700082: The refresh token has expired due to inactivity." }],
    [{ error: "interaction_required", error_description: "AADSTS50076: you must use multi-factor authentication" }],
    [{ error: "invalid_grant", error_description: "AADSTS50173: The provided grant has expired due to it being revoked" }],
  ])("asks for a reconnect on %j", async (body) => {
    override = (call) => (call.url.host === "login.microsoftonline.com" ? json(body, 400) : undefined);
    await expect(microsoftProvider.refreshAccessToken("rt")).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it("treats a bad client secret and outages as ours, not the user's", async () => {
    override = (call) =>
      call.url.host === "login.microsoftonline.com"
        ? json({ error: "invalid_client", error_description: "AADSTS7000222: The provided client secret keys are expired." }, 401)
        : undefined;
    const err = await microsoftProvider.refreshAccessToken("rt").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ReauthRequiredError);
    expect(err).toMatchObject({ code: "client_invalid", status: 401 });
    override = (call) => (call.url.host === "login.microsoftonline.com" ? json({ error: "temporarily_unavailable" }, 503) : undefined);
    await expect(microsoftProvider.refreshAccessToken("rt")).rejects.toMatchObject({ code: "refresh_failed", status: 503 });
  });

  it("revoke is a no-op (no per-token revocation at Microsoft)", async () => {
    await microsoftProvider.revoke("rt");
    expect(calls).toHaveLength(0);
  });
});

// ─── Push ───────────────────────────────────────────────────────────────

describe("startWatch / stopWatch", () => {
  it("creates a subscription on new inbox mail with our clientState", async () => {
    const watch = await microsoftProvider.startWatch(CONN, "eyJ.at");
    const expires = new Date(NOW + SUBSCRIPTION_MINUTES * 60_000).toISOString();
    expect(watch).toEqual({ watchId: "11111111-2222-3333-4444-555555555555", expiresAt: expires, cursor: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", href: `${G}/subscriptions`, auth: "Bearer eyJ.at" });
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      changeType: "created",
      notificationUrl: "https://app.unreceipt.com/api/mailboxes/push/microsoft",
      resource: "me/mailFolders('inbox')/messages",
      expirationDateTime: expires.replace(".000Z", "Z"),
      clientState: STATE,
      latestSupportedTlsVersion: "v1_2",
    });
  });

  it("renews an existing subscription in place (the daily job)", async () => {
    const watch = await microsoftProvider.startWatch({ ...CONN, watch_id: "sub-old" }, "eyJ.at");
    expect(watch.watchId).toBe("sub-old");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "PATCH", href: `${G}/subscriptions/sub-old` });
    expect(Object.keys(JSON.parse(calls[0].body ?? ""))).toEqual(["expirationDateTime"]);
  });

  it("creates a new subscription when the old one is gone (404), fails on other errors", async () => {
    override = (call) => (call.method === "PATCH" ? graphError(404, "ResourceNotFound") : undefined);
    const watch = await microsoftProvider.startWatch({ ...CONN, watch_id: "sub-old" }, "eyJ.at");
    expect(watch.watchId).toBe("11111111-2222-3333-4444-555555555555");
    expect(calls.map((c) => c.method)).toEqual(["PATCH", "POST"]);

    calls = [];
    override = (call) => (call.method === "PATCH" ? graphError(500, "InternalServerError") : undefined);
    await expect(microsoftProvider.startWatch({ ...CONN, watch_id: "sub-old" }, "at")).rejects.toMatchObject({
      code: "watch_renew_failed",
      status: 500,
    });
    expect(calls.map((c) => c.method)).toEqual(["PATCH"]);

    override = (call) => (call.method === "POST" ? graphError(400, "ValidationError") : undefined);
    await expect(microsoftProvider.startWatch(CONN, "at")).rejects.toMatchObject({ code: "watch_failed", status: 400 });
  });

  it("deletes the subscription; already gone is fine", async () => {
    await microsoftProvider.stopWatch({ ...CONN, watch_id: "sub-1" }, "eyJ.at");
    expect(calls[0]).toMatchObject({ method: "DELETE", href: `${G}/subscriptions/sub-1` });
    override = () => graphError(404, "ResourceNotFound");
    await expect(microsoftProvider.stopWatch({ ...CONN, watch_id: "sub-1" }, "at")).resolves.toBeUndefined();
    override = () => graphError(500, "x");
    await expect(microsoftProvider.stopWatch({ ...CONN, watch_id: "sub-1" }, "at")).rejects.toMatchObject({ code: "stop_failed" });
    calls = [];
    await microsoftProvider.stopWatch(CONN, "at");
    expect(calls).toHaveLength(0);
  });
});

describe("notifications", () => {
  it("compares the clientState in constant time and keeps only matching items", () => {
    expect(clientStateMatches(STATE, STATE)).toBe(true);
    expect(clientStateMatches("other", STATE)).toBe(false);
    expect(clientStateMatches(undefined, STATE)).toBe(false);
    expect(clientStateMatches(STATE, "")).toBe(false);
    const item = (subscriptionId: unknown, clientState: unknown) => ({
      subscriptionId,
      clientState,
      changeType: "created",
      resource: "Users/x/Messages/y",
      resourceData: { id: "y" },
    });
    expect(
      acceptedSubscriptions(
        { value: [item("sub-1", STATE), item("sub-1", STATE), item("sub-2", "wrong"), item("../x", STATE), item(42, STATE), null] },
        STATE,
      ),
    ).toEqual({ ids: ["sub-1"], refused: 4 });
    expect(acceptedSubscriptions({ nope: 1 }, STATE)).toEqual({ ids: [], refused: 0 });
  });
});

describe("cursor", () => {
  it("round-trips and refuses links that aren't Graph's own", () => {
    const c = { link: `${DELTA_BASE}?$deltatoken=abc`, since: "2026-11-13T09:00:00.000Z" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(encodeCursor({ ...c, link: "https://evil.example/v1.0/me/x" }))).toBeNull();
    expect(decodeCursor(encodeCursor({ ...c, link: "https://graph.microsoft.com.evil.example/v1.0/me/x" }))).toBeNull();
    expect(decodeCursor(encodeCursor({ ...c, link: "http://graph.microsoft.com/v1.0/me/x" }))).toBeNull();
    expect(decodeCursor("12345")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(isGraphMeUrl(`${G}/users/someone-else/messages`)).toBe(false);
  });
});

// ─── Sync ───────────────────────────────────────────────────────────────

describe("sync (delta)", () => {
  it("follows nextLink to the deltaLink, downloads only matches and saves the cursor", async () => {
    messages = {
      m1: { subject: "Weekly digest: 5 new posts", from: "news@blog.example" },
      m2: { subject: "Your receipt from Acme", received: "2026-11-13T11:40:00Z" },
      m3: { subject: "Team lunch on Friday?", from: "colleague@acme.se" },
      m4: { subject: "Your documents", hasAttachments: true, attachments: ["Invoice-2026-11.pdf"], from: "billing@acme.se" },
      m5: { subject: "Holiday photos", hasAttachments: true, attachments: ["beach.jpg"], from: "friend@x.se" },
      m6: { subject: "receipt", removed: true },
    };
    deltaPages = {
      "delta:t0": { ids: ["m1", "m2", "m3"], next: "s1" },
      "skip:s1": { ids: ["m4", "m5", "m6"], delta: "t1" },
    };
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "eyJ.at", {});
    expect(deltaCalls().map((c) => c.url.searchParams.get("$deltatoken") ?? c.url.searchParams.get("$skiptoken"))).toEqual([
      "t0",
      "s1",
    ]);
    expect(deltaCalls()[0].prefer).toBe("odata.maxpagesize=50");
    // Attachment names are asked only for a non-matching message that has some.
    expect(attachmentFetches()).toEqual(["m4", "m5"]);
    expect(rawFetches()).toEqual(["m2", "m4"]);
    expect(out.processed).toBe(2);
    expect(out.created).toBe(2);
    // The deltaLink, and `since` moved up to just below the newest mail seen.
    expect(decodeCursor(out.cursor)).toEqual({
      link: `${DELTA_BASE}?$deltatoken=t1`,
      since: new Date(Date.parse("2026-11-13T11:40:00Z") - SINCE_SLACK_MS).toISOString(),
    });
    expect(mocks.limit).toHaveBeenCalledWith("mailboxIngest", "conn-1");
    expect(mocks.limit).toHaveBeenCalledWith("mailboxIngestUser", CONN.user_id);
    expect(mocks.claim).toHaveBeenCalledWith("conn-1", "m2");
  });

  it("hands the raw message to the shared ingest", async () => {
    messages = { m1: { subject: "Your receipt from Uber" } };
    deltaPages = { "delta:t0": { ids: ["m1"], delta: "t1" } };
    const deadline = NOW + 280_000;
    await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "eyJ.at", { deadline });
    expect(mocks.ingest).toHaveBeenCalledTimes(1);
    const input = mocks.ingest.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: CONN.user_id,
      source: "mailbox",
      subject: "Your receipt from Uber",
      from: "noreply@uber.com",
      to: "anna@outlook.com",
      messageId: "<m1@mail.example>",
      text: "Total 129,00 kr\r\n",
      html: null,
      // Outlook mail is never DMARC-trusted yet (trust.ts).
      trust: { dmarc: null },
    });
    expect(Buffer.isBuffer(input.rawEml)).toBe(true);
    expect(input.rawEml.toString("latin1")).toContain("Message-ID: <m1@mail.example>");
    expect(input.deadline).toBeLessThan(deadline);
  });

  it("ignores older mail reported by the delta (read/unread changes)", async () => {
    messages = {
      old: { subject: "Your receipt", received: "2026-11-12T08:00:00Z" },
      fresh: { subject: "Your receipt", received: "2026-11-13T10:00:00Z" },
    };
    deltaPages = { "delta:t0": { ids: ["old", "fresh"], delta: "t1" } };
    await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0", "2026-11-13T09:00:00.000Z") }, "at", {});
    expect(rawFetches()).toEqual(["fresh"]);
  });

  it("starts a first sync at the connection's creation, never earlier", async () => {
    messages = {
      before: { subject: "Your receipt", received: "2026-11-13T10:00:00Z" },
      after: { subject: "Your receipt", received: "2026-11-13T11:30:00Z" },
    };
    deltaPages = { initial: { ids: ["before", "after"], delta: "t1" } };
    const out = await microsoftProvider.sync(CONN, "at", {});
    const first = deltaCalls()[0];
    expect(first.href).toBe(initialDeltaUrl(Date.parse(CONN.created_at)));
    expect(first.url.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-11-13T11:00:00Z");
    expect(first.url.searchParams.get("$select")).toBe("subject,from,hasAttachments,internetMessageId,receivedDateTime");
    expect(rawFetches()).toEqual(["after"]);
    expect(decodeCursor(out.cursor)?.link).toBe(`${DELTA_BASE}?$deltatoken=t1`);
  });

  it("restarts the delta when Graph lost its state (410)", async () => {
    messages = { m1: { subject: "Your receipt" } };
    deltaPages = { "delta:gone": { status: 410, code: "SyncStateNotFound" }, initial: { ids: ["m1"], delta: "t9" } };
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("gone", "2026-11-13T11:15:00.000Z") }, "at", {});
    expect(deltaCalls()[1].url.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-11-13T11:15:00Z");
    expect(rawFetches()).toEqual(["m1"]);
    expect(decodeCursor(out.cursor)?.link).toBe(`${DELTA_BASE}?$deltatoken=t9`);
  });

  it("stops at the rate limit with the cursor unchanged", async () => {
    messages = { m1: { subject: "Your receipt" }, m2: { subject: "Your receipt" } };
    deltaPages = { "delta:t0": { ids: ["m1", "m2"], delta: "t1" } };
    // m1: per connection, per user; m2: per connection refused.
    mocks.limit
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, retryAfterSeconds: 60 });
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {});
    expect(rawFetches()).toEqual(["m1"]);
    expect(out).toEqual({ cursor: null, processed: 1, created: 1 });
  });

  it("stops at the per-user limit (all mailboxes) with the cursor unchanged", async () => {
    messages = { m1: { subject: "Your receipt" }, m2: { subject: "Your receipt" } };
    deltaPages = { "delta:t0": { ids: ["m1", "m2"], delta: "t1" } };
    let userHits = 0;
    mocks.limit.mockImplementation(async (rule: string) =>
      rule === "mailboxIngestUser" && ++userHits > 1 ? { ok: false, retryAfterSeconds: 60 } : { ok: true },
    );
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {});
    expect(rawFetches()).toEqual(["m1"]);
    expect(out).toEqual({ cursor: null, processed: 1, created: 1 });
  });

  it("stops when throttled (429) with the cursor unchanged", async () => {
    deltaPages = { "delta:t0": { status: 429, code: "ApplicationThrottled" } };
    expect(await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {})).toEqual({
      cursor: null,
      processed: 0,
      created: 0,
    });

    // Throttled on a download in the second page: resume from that page.
    messages = { m1: { subject: "Your receipt" }, m2: { subject: "Your receipt" } };
    deltaPages = { "delta:t0": { ids: ["m1"], next: "s1" }, "skip:s1": { ids: ["m2"], delta: "t1" } };
    override = (call) =>
      call.url.pathname.includes("/m2/") ? new Response("", { status: 429, headers: { "retry-after": "30" } }) : undefined;
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {});
    expect(out.processed).toBe(1);
    expect(decodeCursor(out.cursor)?.link).toBe(`${DELTA_BASE}?$skiptoken=s1`);
  });

  it("stops before a message another sync holds, or one the ingest couldn't save", async () => {
    messages = { m1: { subject: "Your receipt" }, m2: { subject: "Your receipt" } };
    deltaPages = { "delta:t0": { ids: ["m1", "m2"], delta: "t1" } };
    mocks.claim.mockResolvedValueOnce(false);
    expect((await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {})).cursor).toBeNull();
    expect(rawFetches()).toEqual([]);

    calls = [];
    mocks.ingest.mockResolvedValueOnce({ kind: "retry", reason: "upload_failed" });
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {});
    expect(out.cursor).toBeNull();
    expect(rawFetches()).toEqual(["m1"]);
    expect(mocks.retry).toHaveBeenCalledWith("conn-1", "m1");
  });

  it("stops before the next download once the mailbox was disconnected mid-sync", async () => {
    messages = { m1: { subject: "Your receipt" }, m2: { subject: "Your receipt" } };
    deltaPages = { "delta:t0": { ids: ["m1", "m2"], delta: "t1" } };
    mocks.live.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {});
    expect(mocks.live).toHaveBeenCalledWith("conn-1");
    expect(rawFetches()).toEqual(["m1"]);
    expect(mocks.ingest).toHaveBeenCalledTimes(1);
    // The delta doesn't move past the message it didn't read.
    expect(decodeCursor(out.cursor)?.link).not.toBe(`${DELTA_BASE}?$deltatoken=t1`);
  });

  it("can't revoke one grant, so a disconnect never claims it did", () => {
    expect(microsoftProvider.canRevoke).toBe(false);
  });

  it("skips a message that failed to save too often, so the delta moves on", async () => {
    messages = { m1: { subject: "Your receipt" }, m2: { subject: "Your receipt" } };
    deltaPages = { "delta:t0": { ids: ["m1", "m2"], delta: "t1" } };
    mocks.ingest.mockResolvedValueOnce({ kind: "retry", reason: "upload_failed" });
    mocks.retry.mockResolvedValueOnce(false);
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", {});
    expect(rawFetches()).toEqual(["m1", "m2"]);
    expect(decodeCursor(out.cursor)?.link).toBe(`${DELTA_BASE}?$deltatoken=t1`);
  });

  it("stops before the deadline", async () => {
    messages = { m1: { subject: "Your receipt" } };
    deltaPages = { "delta:t0": { ids: ["m1"], delta: "t1" } };
    const out = await microsoftProvider.sync({ ...CONN, cursor: storedCursor("t0") }, "at", { deadline: NOW + 5_000 });
    expect(out).toEqual({ cursor: null, processed: 0, created: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("sync (backfill)", () => {
  it("lists the window newest first, page by page, then starts the delta", async () => {
    messages = {
      a: { subject: "Your receipt", received: "2026-11-12T10:00:00Z" },
      b: { subject: "Newsletter", received: "2026-11-01T10:00:00Z", from: "news@x.se" },
      c: { subject: "Kvitto", received: "2026-10-20T10:00:00Z" },
      n: { subject: "Your receipt", received: "2026-11-13T11:55:00Z" },
    };
    listPages = { first: { ids: ["a", "b"], next: "p2" }, "skip:p2": { ids: ["c"] } };
    deltaPages = { initial: { ids: ["n"], delta: "t1" } };
    const out = await microsoftProvider.sync(CONN, "at", { backfillDays: 30, maxMessages: 100 });
    const list = calls.filter((c) => c.url.pathname === "/v1.0/me/mailFolders/inbox/messages");
    expect(list).toHaveLength(2);
    expect(Object.fromEntries(list[0].url.searchParams)).toEqual({
      $filter: "receivedDateTime ge 2026-10-14T12:00:00Z",
      $orderby: "receivedDateTime desc",
      $top: "50",
      $select: "subject,from,hasAttachments,internetMessageId,receivedDateTime",
    });
    // The delta starts just before the backfill did.
    expect(deltaCalls()[0].url.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-11-13T11:50:00Z");
    expect(rawFetches()).toEqual(["a", "c", "n"]);
    expect(out.created).toBe(3);
    expect(decodeCursor(out.cursor)?.link).toBe(`${DELTA_BASE}?$deltatoken=t1`);
  });

  it("downloads at most maxMessages and leaves the delta to the next sync", async () => {
    messages = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`r${i}`, { subject: "Your receipt", received: `2026-11-0${i + 1}T10:00:00Z` }]),
    );
    listPages = { first: { ids: ["r5", "r4", "r3"], next: "p2" }, "skip:p2": { ids: ["r2", "r1", "r0"] } };
    const out = await microsoftProvider.sync(CONN, "at", { backfillDays: 30, maxMessages: 4 });
    expect(rawFetches()).toEqual(["r5", "r4", "r3", "r2"]);
    expect(out.processed).toBe(4);
    expect(deltaCalls()).toHaveLength(0);
    // The next sync starts the delta from just before this backfill.
    expect(decodeCursor(out.cursor)).toEqual({
      link: initialDeltaUrl(NOW - 10 * 60_000),
      since: new Date(NOW - 10 * 60_000).toISOString(),
    });
  });

  it("skips a message another sync holds instead of stopping", async () => {
    messages = { a: { subject: "Your receipt" }, b: { subject: "Your receipt" } };
    listPages = { first: { ids: ["a", "b"] } };
    mocks.claim.mockResolvedValueOnce(false);
    await microsoftProvider.sync(CONN, "at", { backfillDays: 30 });
    expect(rawFetches()).toEqual(["b"]);
  });
});
