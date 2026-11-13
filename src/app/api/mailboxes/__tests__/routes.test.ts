// @vitest-environment node
// /api/mailboxes/* with a fake provider (standing in for Gmail) and an
// in-memory database: connect (website and iPhone app link), callback,
// the app's claim, list, disconnect and the app's connect link.

import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { createFakeDb } from "@/lib/mailboxes/__tests__/fake-db";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const HOST = "app.unreceipt.com";

const mocks = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("@/lib/mailboxes/__tests__/fake-db").createFakeDb>,
  user: null as { id: string; email?: string } | null,
  users: {} as Record<string, { id: string; email: string }>,
  limit: vi.fn(),
  afterTasks: [] as Promise<unknown>[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => mocks.db.client.from(table),
    auth: {
      admin: {
        getUserById: async (id: string) =>
          mocks.users[id]
            ? { data: { user: mocks.users[id] }, error: null }
            : { data: { user: null }, error: { message: "User not found" } },
      },
    },
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.limit,
}));
vi.mock("@/lib/mailboxes/google", async () => ({
  googleProvider: (await import("@/lib/mailboxes/__tests__/fake-provider")).fakeProvider,
}));
// after() needs a real request; here the task runs at once and is collected.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    mocks.afterTasks.push(Promise.resolve().then(task));
  },
}));

import { FAKE_AUTH_BASE, fakeProvider, resetFakeProvider } from "@/lib/mailboxes/__tests__/fake-provider";
import { signConnectLink } from "@/lib/mailboxes/link-token";
import { sha256Hex } from "@/lib/mailboxes/oauth";
import { forgetAccessToken } from "@/lib/mailboxes/access-token";
import { GET as connectGET, POST as connectPOST } from "@/app/api/mailboxes/connect/[provider]/route";
import { GET as callbackGET } from "@/app/api/mailboxes/callback/[provider]/route";
import { POST as claimPOST } from "@/app/api/mailboxes/claim/route";
import { POST as linkPOST } from "@/app/api/mailboxes/connect-link/route";
import { GET as listGET } from "@/app/api/mailboxes/route";
import { DELETE as deleteRoute } from "@/app/api/mailboxes/[id]/route";

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

function req(path: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}) {
  return new NextRequest(`https://${HOST}${path}`, {
    method: init.method ?? "GET",
    headers: { host: HOST, ...(init.headers ?? {}) },
    body: init.body,
  });
}

const location = (res: Response) => res.headers.get("location") ?? "";

/** Starts a web flow and returns the state and the binding cookie. */
async function startWebFlow(): Promise<{ state: string; cookie: string; res: NextResponse }> {
  const res = await connectGET(req("/api/mailboxes/connect/google"), params({ provider: "google" }));
  expect(res.status).toBe(303);
  const url = new URL(location(res));
  const state = url.searchParams.get("state")!;
  const [cookie] = res.cookies.getAll();
  return { state, cookie: `${cookie.name}=${cookie.value}`, res };
}

const callback = (query: string, cookie?: string) =>
  callbackGET(
    req(`/api/mailboxes/callback/google?${query}`, { headers: cookie ? { cookie } : {} }),
    params({ provider: "google" }),
  );

/**
 * The iPhone app's whole flow in the sign-in sheet (no session there): the
 * link minted for `linkUser`, Continue, the provider, the callback. Returns
 * the callback's redirect.
 */
async function appFlow(linkUser = USER): Promise<NextResponse> {
  const signedIn = mocks.user;
  mocks.user = null;
  const token = signConnectLink({ userId: linkUser, provider: "google" }).token;
  const start = await connectPOST(
    req("/api/mailboxes/connect/google", {
      method: "POST",
      headers: { origin: `https://${HOST}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ link: token }).toString(),
    }),
    params({ provider: "google" }),
  );
  const [cookie] = start.cookies.getAll();
  const state = mocks.db.tables.mailbox_oauth_pending.at(-1)!.nonce as string;
  const res = await callback(`state=${state}&code=4/abc`, `${cookie.name}=${cookie.value}`);
  mocks.user = signedIn;
  return res;
}

/** The one-time code from unreceipt://mailboxes?status=claim&code=…. */
function claimCode(res: Response): string {
  const url = new URL(location(res));
  expect(url.protocol + url.host + url.pathname).toBe("unreceipt:mailboxes");
  expect(url.searchParams.get("status")).toBe("claim");
  expect(url.searchParams.get("provider")).toBe("google");
  return url.searchParams.get("code")!;
}

const claim = (body: unknown, headers: Record<string, string> = {}) =>
  claimPOST(
    req("/api/mailboxes/claim", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

function seedConnections(userId: string, n: number) {
  for (let i = 0; i < n; i++) {
    mocks.db.tables.mailbox_connections.push({
      id: `0000000${i}-0000-4000-8000-00000000000${i}`,
      user_id: userId,
      provider: "google",
      email: `seed${i}@gmail.com`,
      refresh_token_enc: "v1.x.y.z",
      status: "active",
      cursor: null,
      watch_id: null,
      watch_expires_at: null,
      last_sync_at: null,
      last_receipt_at: null,
      last_error: null,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    });
  }
}

beforeEach(() => {
  process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.MAILBOX_STATE_SECRET = "a-test-secret-that-is-long-enough-1234567890";
  mocks.db = createFakeDb({ mailbox_connections: [], mailbox_oauth_pending: [], mailbox_oauth_parked: [] });
  mocks.user = { id: USER, email: "anna@acme.se" };
  mocks.users = { [USER]: { id: USER, email: "anna@acme.se" }, [OTHER]: { id: OTHER, email: "eve@evil.test" } };
  mocks.limit.mockReset().mockResolvedValue({ ok: true });
  mocks.afterTasks = [];
  resetFakeProvider(fakeProvider);
});

describe("GET /api/mailboxes/connect/[provider] (website)", () => {
  it("answers 404 for an unknown or unconfigured provider", async () => {
    expect((await connectGET(req("/api/mailboxes/connect/yahoo"), params({ provider: "yahoo" }))).status).toBe(404);
    // Outlook is still a stub (step 4): not configured.
    expect((await connectGET(req("/api/mailboxes/connect/microsoft"), params({ provider: "microsoft" }))).status).toBe(404);
    fakeProvider.configured.mockReturnValue(false);
    expect((await connectGET(req("/api/mailboxes/connect/google"), params({ provider: "google" }))).status).toBe(404);
    fakeProvider.configured.mockReturnValue(true);
    delete process.env.MAILBOX_TOKEN_KEY;
    expect((await connectGET(req("/api/mailboxes/connect/google"), params({ provider: "google" }))).status).toBe(404);
  });

  it("sends a signed-out browser to the login page", async () => {
    mocks.user = null;
    const res = await connectGET(req("/api/mailboxes/connect/google"), params({ provider: "google" }));
    expect(res.status).toBe(303);
    expect(location(res)).toBe("https://app.unreceipt.com/app/login?next=/app/settings");
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(0);
  });

  it("stores a pending flow and goes to the consent screen with state, PKCE and a binding cookie", async () => {
    const { state, res } = await startWebFlow();
    const url = new URL(location(res));
    expect(url.origin + url.pathname).toBe(FAKE_AUTH_BASE);
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.unreceipt.com/api/mailboxes/callback/google");
    expect(mocks.limit).toHaveBeenCalledWith("mailboxConnect", USER);

    const [row] = mocks.db.tables.mailbox_oauth_pending;
    expect(row).toMatchObject({ nonce: state, user_id: USER, provider: "google", client: "web", link_jti: null });
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(row.code_verifier as string).digest("base64url"),
    );

    const [cookie] = res.cookies.getAll();
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/api/mailboxes/callback" });
    expect(row.browser_binding).toBe(sha256Hex(cookie.value));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses at 5 mailboxes and when rate-limited", async () => {
    seedConnections(USER, 5);
    let res = await connectGET(req("/api/mailboxes/connect/google"), params({ provider: "google" }));
    expect(location(res)).toBe("https://app.unreceipt.com/app/settings?mailbox=error&reason=limit");
    mocks.db.tables.mailbox_connections = [];
    mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    res = await connectGET(req("/api/mailboxes/connect/google"), params({ provider: "google" }));
    expect(location(res)).toBe("https://app.unreceipt.com/app/settings?mailbox=error&reason=rate_limited");
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(0);
  });

  it("at 5 mailboxes, still lets a mailbox that needs reconnecting be reconnected", async () => {
    seedConnections(USER, 5);
    (mocks.db.tables.mailbox_connections[2] as { status: string }).status = "needs_reconnect";
    const res = await connectGET(req("/api/mailboxes/connect/google"), params({ provider: "google" }));
    expect(location(res)).toContain(FAKE_AUTH_BASE);
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(1);
    // (All five active is refused: see the test above. The callback still
    // refuses a sixth new address.)
  });
});

describe("/api/mailboxes/connect/[provider]?link= (iPhone app)", () => {
  const linkFor = (userId = USER) => signConnectLink({ userId, provider: "google" }).token;

  it("shows a confirmation page naming the account, and never goes straight to the provider", async () => {
    mocks.user = null; // the sign-in sheet has no session
    const token = linkFor(OTHER);
    const res = await connectGET(
      req(`/api/mailboxes/connect/google?link=${encodeURIComponent(token)}`),
      params({ provider: "google" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    // The full address: a masked one looks the same for many accounts, so a
    // victim couldn't tell an attacker's link from their own.
    expect(html).toContain("eve@evil.test");
    expect(html).toContain("Not your UnReceipt account? Don");
    // Its own form must carry a real Origin: "no-referrer" would make the
    // browser send `Origin: null`, which the POST refuses.
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
    expect(html).toContain('<meta name="referrer" content="same-origin">');
    expect(html).toContain('method="post" action="/api/mailboxes/connect/google"');
    expect(html).not.toContain(FAKE_AUTH_BASE);
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(0);
    expect(fakeProvider.authUrl).not.toHaveBeenCalled();
  });

  it("sends an expired or forged link back to the app", async () => {
    const old = signConnectLink({ userId: USER, provider: "google" }, Date.now() - 10 * 60_000).token;
    let res = await connectGET(req(`/api/mailboxes/connect/google?link=${old}`), params({ provider: "google" }));
    expect(location(res)).toBe("unreceipt://mailboxes?status=error&reason=link_expired");
    res = await connectGET(req(`/api/mailboxes/connect/google?link=abc.def`), params({ provider: "google" }));
    expect(location(res)).toBe("unreceipt://mailboxes?status=error&reason=link_invalid");
  });

  const post = (token: string, origin?: string) =>
    connectPOST(
      req("/api/mailboxes/connect/google", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          ...(origin !== undefined ? { origin } : {}),
        },
        body: new URLSearchParams({ link: token }).toString(),
      }),
      params({ provider: "google" }),
    );

  it("starts the flow only from a same-origin Continue, once per link", async () => {
    mocks.user = null;
    const token = linkFor();
    expect((await post(token)).status).toBe(403);
    expect((await post(token, "https://evil.test")).status).toBe(403);
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(0);

    const res = await post(token, `https://${HOST}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // A page that moves on by itself: a redirect after a form POST would be
    // blocked by the site's form-action CSP.
    expect(html).toMatch(/http-equiv="refresh" content="0; url=https:\/\/accounts\.example\.test/);
    const [row] = mocks.db.tables.mailbox_oauth_pending;
    expect(row).toMatchObject({ user_id: USER, client: "app" });
    expect(row.link_jti).toBeTruthy();
    const [cookie] = res.cookies.getAll();
    expect(row.browser_binding).toBe(sha256Hex(cookie.value));

    const again = await post(token, `https://${HOST}`);
    expect(await again.text()).toContain("unreceipt://mailboxes?status=error&amp;reason=link_used");
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(1);
  });
});

describe("GET /api/mailboxes/callback/[provider]", () => {
  it("connects the mailbox, starts the watch, queues the backfill and lands on Settings", async () => {
    const { state, cookie } = await startWebFlow();
    const res = await callback(`state=${state}&code=4/abc`, cookie);
    expect(res.status).toBe(303);
    expect(location(res)).toBe("https://app.unreceipt.com/app/settings?mailbox=connected");
    expect(fakeProvider.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: "4/abc", redirectUri: "https://app.unreceipt.com/api/mailboxes/callback/google" }),
    );
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(0);
    const [conn] = mocks.db.tables.mailbox_connections;
    expect(conn).toMatchObject({ user_id: USER, provider: "google", email: "anna@gmail.com", status: "active", cursor: "1000" });
    expect(conn.refresh_token_enc).toMatch(/^v1\./);
    expect(fakeProvider.startWatch).toHaveBeenCalledWith(expect.objectContaining({ id: conn.id }), "ya29.access");

    await Promise.all(mocks.afterTasks);
    expect(fakeProvider.sync).toHaveBeenCalledWith(
      expect.objectContaining({ id: conn.id, cursor: "1000" }),
      "ya29.access",
      { backfillDays: 30, maxMessages: 100, deadline: expect.any(Number) },
    );
    expect(mocks.db.tables.mailbox_connections[0].cursor).toBe("1005");
    // The binding cookie is cleared.
    expect(res.cookies.getAll()[0]).toMatchObject({ value: "", maxAge: 0 });
    forgetAccessToken(conn.id as string);
  });

  it("explains a consent without the mail permission", async () => {
    const { MissingScopeError } = await import("@/lib/mailboxes/types");
    fakeProvider.exchangeCode.mockRejectedValueOnce(new MissingScopeError("google"));
    const { state, cookie } = await startWebFlow();
    const res = await callback(`state=${state}&code=4/abc`, cookie);
    expect(location(res)).toBe("https://app.unreceipt.com/app/settings?mailbox=error&reason=scope_missing");
    expect(mocks.db.tables.mailbox_connections ?? []).toHaveLength(0);
  });

  it("works once per state", async () => {
    const { state, cookie } = await startWebFlow();
    await callback(`state=${state}&code=4/abc`, cookie);
    const again = await callback(`state=${state}&code=4/abc`, cookie);
    expect(location(again)).toBe("https://app.unreceipt.com/app/settings?mailbox=error&reason=invalid_state");
    expect(fakeProvider.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it("refuses an expired flow", async () => {
    const { state, cookie } = await startWebFlow();
    mocks.db.tables.mailbox_oauth_pending[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await callback(`state=${state}&code=4/abc`, cookie);
    expect(location(res)).toBe("https://app.unreceipt.com/app/settings?mailbox=error&reason=expired");
    expect(fakeProvider.exchangeCode).not.toHaveBeenCalled();
  });

  it("refuses another browser (missing or different cookie)", async () => {
    const first = await startWebFlow();
    expect(location(await callback(`state=${first.state}&code=x`))).toContain("reason=wrong_browser");
    const second = await startWebFlow();
    const [name] = second.cookie.split("=");
    expect(location(await callback(`state=${second.state}&code=x`, `${name}=forged`))).toContain("reason=wrong_browser");
    expect(fakeProvider.exchangeCode).not.toHaveBeenCalled();
  });

  it("refuses when another user is signed in on the website", async () => {
    const { state, cookie } = await startWebFlow();
    mocks.user = { id: OTHER };
    expect(location(await callback(`state=${state}&code=x`, cookie))).toContain("reason=wrong_account");
    mocks.db.tables.mailbox_oauth_pending = [];
    mocks.user = { id: USER };
    const next = await startWebFlow();
    mocks.user = null;
    expect(location(await callback(`state=${next.state}&code=x`, next.cookie))).toContain("reason=wrong_account");
    expect(fakeProvider.exchangeCode).not.toHaveBeenCalled();
  });

  it("explains a refusal on the provider's screen", async () => {
    let flow = await startWebFlow();
    expect(location(await callback(`state=${flow.state}&error=access_denied`, flow.cookie))).toBe(
      "https://app.unreceipt.com/app/settings?mailbox=error&reason=denied",
    );
    flow = await startWebFlow();
    const desc = encodeURIComponent("AADSTS65001: The user or administrator has not consented to use the application.");
    expect(location(await callback(`state=${flow.state}&error=invalid_client&error_description=${desc}`, flow.cookie))).toContain(
      "reason=admin_consent",
    );
    expect(fakeProvider.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.db.tables.mailbox_oauth_pending).toHaveLength(0);
  });

  it("refuses an unknown state", async () => {
    expect(location(await callback("state=" + "x".repeat(43) + "&code=y"))).toContain("reason=invalid_state");
    expect(location(await callback("code=y"))).toContain("reason=invalid_state");
  });

  it("never saves an app flow's mailbox: it parks the grant and hands the app a one-time code", async () => {
    const res = await appFlow();
    const code = claimCode(res);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.cookies.getAll()[0]).toMatchObject({ value: "", maxAge: 0 });

    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
    expect(fakeProvider.startWatch).not.toHaveBeenCalled();
    await Promise.all(mocks.afterTasks);
    expect(fakeProvider.sync).not.toHaveBeenCalled();

    const [parked] = mocks.db.tables.mailbox_oauth_parked;
    expect(parked).toMatchObject({ code_hash: sha256Hex(code), user_id: USER, provider: "google", email: "anna@gmail.com" });
    // Neither the code nor the token is stored in the clear.
    expect(JSON.stringify(parked)).not.toContain(code);
    expect(JSON.stringify(parked)).not.toContain("1//refresh-token-secret");
    expect(parked.refresh_token_enc).toMatch(/^v1\./);
    expect(Date.parse(parked.expires_at as string) - Date.now()).toBeLessThanOrEqual(10 * 60_000);
  });

  it("revokes the grant when it can't be parked", async () => {
    mocks.db.failNext.mailbox_oauth_parked = { code: "XX000", message: "down" };
    const res = await appFlow();
    expect(location(res)).toBe("unreceipt://mailboxes?status=error&reason=server_error");
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//refresh-token-secret");
    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
  });

  it("names a Microsoft account without a mailbox", async () => {
    const { MailboxProviderError } = await import("@/lib/mailboxes/types");
    fakeProvider.exchangeCode.mockRejectedValueOnce(new MailboxProviderError("no_mailbox", 404));
    const { state, cookie } = await startWebFlow();
    expect(location(await callback(`state=${state}&code=x`, cookie))).toBe(
      "https://app.unreceipt.com/app/settings?mailbox=error&reason=no_mailbox",
    );
    fakeProvider.exchangeCode.mockRejectedValueOnce(new MailboxProviderError("no_mailbox", 404));
    expect(location(await appFlow())).toBe("unreceipt://mailboxes?status=error&reason=no_mailbox");
    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
    expect(mocks.db.tables.mailbox_oauth_parked).toHaveLength(0);
  });

  it("refuses a 6th address (and revokes what it was given) but reconnects a known one at the cap", async () => {
    // Four mailboxes when the flow starts, a fifth connected meanwhile.
    seedConnections(USER, 4);
    let flow = await startWebFlow();
    seedConnections(USER, 5);
    mocks.db.tables.mailbox_connections.splice(4, 4);
    mocks.db.tables.mailbox_connections[4].email = "fifth@gmail.com";
    mocks.db.tables.mailbox_connections[4].id = "00000009-0000-4000-8000-000000000009";
    expect(mocks.db.tables.mailbox_connections).toHaveLength(5);

    let res = await callback(`state=${flow.state}&code=x`, flow.cookie);
    expect(location(res)).toContain("reason=limit");
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//refresh-token-secret");
    expect(mocks.db.tables.mailbox_connections).toHaveLength(5);

    // seed0@gmail.com is already connected: reconnecting it is fine at the cap.
    const fifth = mocks.db.tables.mailbox_connections.pop()!;
    flow = await startWebFlow();
    mocks.db.tables.mailbox_connections.push(fifth);
    fakeProvider.exchangeCode.mockResolvedValueOnce({
      refreshToken: "1//new",
      accessToken: "at",
      expiresAt: Date.now() + 3600_000,
      email: "SEED0@gmail.com",
    });
    res = await callback(`state=${flow.state}&code=x`, flow.cookie);
    expect(location(res)).toBe("https://app.unreceipt.com/app/settings?mailbox=connected");
    expect(mocks.db.tables.mailbox_connections).toHaveLength(5);
  });

  it("keeps the connection when the watch can't start", async () => {
    fakeProvider.startWatch.mockRejectedValueOnce(new Error("pubsub down"));
    const { state, cookie } = await startWebFlow();
    const res = await callback(`state=${state}&code=x`, cookie);
    expect(location(res)).toBe("https://app.unreceipt.com/app/settings?mailbox=connected");
    expect(mocks.db.tables.mailbox_connections[0]).toMatchObject({ last_error: "watch_failed" });
  });
});

describe("POST /api/mailboxes/claim (iPhone app)", () => {
  it("saves the mailbox for the user who minted the link, starts the watch and the backfill", async () => {
    const code = claimCode(await appFlow());
    const res = await claim({ code }); // bearer: no Origin
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    const [conn] = mocks.db.tables.mailbox_connections;
    expect(conn).toMatchObject({ user_id: USER, provider: "google", email: "anna@gmail.com", status: "active" });
    expect(body).toEqual({
      ok: true,
      connection: {
        id: conn.id,
        provider: "google",
        email: "anna@gmail.com",
        status: "active",
        lastReceiptAt: null,
        lastSyncAt: null,
        createdAt: conn.created_at,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/refresh|v1\.|cursor/);
    expect(mocks.limit).toHaveBeenCalledWith("mailboxClaim", USER);
    // The connection row holds its own encryption of the token.
    const { getDecryptedToken } = await import("@/lib/mailboxes/store");
    expect(await getDecryptedToken(conn as never)).toBe("1//refresh-token-secret");

    // The exchange's access token is gone by now: a fresh one starts the watch.
    expect(fakeProvider.refreshAccessToken).toHaveBeenCalledWith("1//refresh-token-secret");
    expect(fakeProvider.startWatch).toHaveBeenCalledWith(expect.objectContaining({ id: conn.id }), "ya29.fresh");
    await Promise.all(mocks.afterTasks);
    expect(fakeProvider.sync).toHaveBeenCalledWith(
      expect.objectContaining({ id: conn.id, cursor: "1000" }),
      "ya29.fresh",
      { backfillDays: 30, maxMessages: 100, deadline: expect.any(Number) },
    );
    expect(mocks.db.tables.mailbox_connections[0].cursor).toBe("1005");
    expect(mocks.db.tables.mailbox_oauth_parked).toHaveLength(0);
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
    forgetAccessToken(conn.id as string);
  });

  it("refuses another signed-in user, revokes the grant and forgets it", async () => {
    // An attacker minted the link for their own account; the victim
    // approved, and the victim's app (signed in as the victim) claims.
    const code = claimCode(await appFlow(OTHER));
    const res = await claim({ code });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "wrong_account" });
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//refresh-token-secret");
    expect(mocks.db.tables.mailbox_oauth_parked).toHaveLength(0);
    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
    expect(fakeProvider.startWatch).not.toHaveBeenCalled();

    // The link's own user can't claim it afterwards either.
    mocks.user = { id: OTHER };
    const again = await claim({ code });
    expect(again.status).toBe(404);
    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
  });

  it("works once", async () => {
    const code = claimCode(await appFlow());
    expect((await claim({ code })).status).toBe(200);
    const again = await claim({ code });
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "invalid" });
    expect(mocks.db.tables.mailbox_connections).toHaveLength(1);
    await Promise.all(mocks.afterTasks);
    forgetAccessToken(mocks.db.tables.mailbox_connections[0].id as string);
  });

  it("refuses an expired grant and revokes it", async () => {
    const code = claimCode(await appFlow());
    mocks.db.tables.mailbox_oauth_parked[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await claim({ code });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "expired" });
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//refresh-token-secret");
    expect(mocks.db.tables.mailbox_oauth_parked).toHaveLength(0);
    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
  });

  it("refuses a 6th address (revoking the grant) but reconnects a known one at the cap", async () => {
    let code = claimCode(await appFlow());
    seedConnections(USER, 5);
    let res = await claim({ code });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "limit", limit: 5 });
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//refresh-token-secret");
    expect(mocks.db.tables.mailbox_connections).toHaveLength(5);

    fakeProvider.exchangeCode.mockResolvedValueOnce({
      refreshToken: "1//new",
      accessToken: "at",
      expiresAt: Date.now() + 3600_000,
      email: "seed0@gmail.com",
    });
    // seed0@gmail.com is already connected: claiming it again is a
    // reconnect, fine at the cap (a fifth mailbox arrives meanwhile).
    const fifth = mocks.db.tables.mailbox_connections.pop()!;
    code = claimCode(await appFlow());
    mocks.db.tables.mailbox_connections.push(fifth);
    res = await claim({ code });
    expect(res.status).toBe(200);
    expect(mocks.db.tables.mailbox_connections).toHaveLength(5);
    await Promise.all(mocks.afterTasks);
  });

  it("refuses the signed-out, cross-site, bad bodies, unknown codes and floods without touching a grant", async () => {
    const code = claimCode(await appFlow());
    mocks.user = null;
    expect((await claim({ code })).status).toBe(401);
    mocks.user = { id: USER };
    expect((await claim({ code }, { origin: "https://evil.test" })).status).toBe(403);
    expect((await claim({ nope: 1 })).status).toBe(400);
    expect((await claim({ code: "x".repeat(43) })).status).toBe(404);
    expect((await claim({ code: "short" })).status).toBe(404);
    mocks.limit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 60 });
    expect((await claim({ code })).status).toBe(429);
    // Still there for the real claim.
    expect(mocks.db.tables.mailbox_oauth_parked).toHaveLength(1);
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
    expect((await claim({ code }, { origin: `https://${HOST}` })).status).toBe(200);
    await Promise.all(mocks.afterTasks);
  });

  it("answers 500 when the grant can't be read", async () => {
    const code = claimCode(await appFlow());
    mocks.db.failNext.mailbox_oauth_parked = { code: "XX000", message: "down" };
    expect((await claim({ code })).status).toBe(500);
    // A key changed since parking: nothing is saved.
    process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
    const res = await claim({ code });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
  });
});

describe("POST /api/mailboxes/connect-link", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    linkPOST(
      req("/api/mailboxes/connect-link", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );

  it("returns a 5-minute link for the caller", async () => {
    const res = await post({ provider: "google" });
    expect(res.status).toBe(200);
    const { url, expiresAt } = await res.json();
    expect(url).toMatch(/^https:\/\/app\.unreceipt\.com\/api\/mailboxes\/connect\/google\?link=/);
    const link = new URL(url).searchParams.get("link")!;
    const { verifyConnectLink } = await import("@/lib/mailboxes/link-token");
    expect(verifyConnectLink(link, "google")).toMatchObject({ ok: true, userId: USER });
    expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    expect(mocks.limit).toHaveBeenCalledWith("mailboxConnectLink", USER);
  });

  it("refuses the signed-out, cross-site, bad bodies, unknown providers, the cap and floods", async () => {
    mocks.user = null;
    expect((await post({ provider: "google" })).status).toBe(401);
    mocks.user = { id: USER };
    expect((await post({ provider: "google" }, { origin: "https://evil.test" })).status).toBe(403);
    expect((await post({ nope: 1 })).status).toBe(400);
    expect((await post({ provider: "microsoft" })).status).toBe(404);
    seedConnections(USER, 5);
    expect((await post({ provider: "google" })).status).toBe(409);
    mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    expect((await post({ provider: "google" })).status).toBe(429);
  });
});

describe("GET /api/mailboxes", () => {
  it("lists the caller's mailboxes without tokens or cursors", async () => {
    seedConnections(USER, 2);
    seedConnections(OTHER, 1);
    mocks.db.tables.mailbox_connections[2].id = "00000007-0000-4000-8000-000000000007";
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(5);
    expect(body.providers).toEqual({ google: true, microsoft: false });
    expect(body.connections).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(/refresh_token|v1\.x|cursor/);
    expect(body.connections[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000000",
      provider: "google",
      email: "seed0@gmail.com",
      status: "active",
      lastReceiptAt: null,
      lastSyncAt: null,
      createdAt: "2026-11-01T00:00:00Z",
    });
  });

  it("needs a signed-in user", async () => {
    mocks.user = null;
    expect((await listGET()).status).toBe(401);
  });
});

describe("DELETE /api/mailboxes/[id]", () => {
  async function connected(): Promise<string> {
    const { state, cookie } = await startWebFlow();
    await callback(`state=${state}&code=x`, cookie);
    await Promise.all(mocks.afterTasks);
    return mocks.db.tables.mailbox_connections[0].id as string;
  }
  const del = (id: string, origin?: string) =>
    deleteRoute(
      req(`/api/mailboxes/${id}`, { method: "DELETE", headers: origin ? { origin } : {} }),
      params({ id }),
    );

  it("disconnects the owner's mailbox: watch stopped, grant revoked, row gone", async () => {
    const id = await connected();
    const res = await del(id, `https://${HOST}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, revoked: true });
    expect(fakeProvider.stopWatch).toHaveBeenCalled();
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//refresh-token-secret");
    expect(mocks.db.tables.mailbox_connections).toHaveLength(0);
  });

  it("answers 404 for someone else's mailbox and leaves it alone", async () => {
    const id = await connected();
    mocks.user = { id: OTHER };
    expect((await del(id)).status).toBe(404);
    expect(mocks.db.tables.mailbox_connections).toHaveLength(1);
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
  });

  it("refuses cross-site, signed-out and malformed ids", async () => {
    const id = await connected();
    expect((await del(id, "https://evil.test")).status).toBe(403);
    expect((await del("not-a-uuid")).status).toBe(404);
    mocks.user = null;
    expect((await del(id)).status).toBe(401);
    expect(mocks.db.tables.mailbox_connections).toHaveLength(1);
  });
});
