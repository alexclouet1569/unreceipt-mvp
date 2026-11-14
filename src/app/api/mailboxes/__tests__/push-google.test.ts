// @vitest-environment node
// POST /api/mailboxes/push/google: Pub/Sub's OIDC token checked against a
// test key served as Google's JWKS, the address mapped to its active Gmail
// connections, 204 at once and the sync queued with after().

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { createFakeDb } from "@/lib/mailboxes/__tests__/fake-db";

const AUD = "https://app.unreceipt.com/api/mailboxes/push/google";
const SA = "gmail-push@unreceipt-prod.iam.gserviceaccount.com";

const mocks = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("@/lib/mailboxes/__tests__/fake-db").createFakeDb>,
  sync: vi.fn(),
  afterTasks: [] as Promise<unknown>[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => mocks.db.client.from(table) }),
}));
vi.mock("@/lib/mailboxes/sync", () => ({ syncConnection: mocks.sync }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    mocks.afterTasks.push(Promise.resolve().then(task));
  },
}));

import { POST } from "@/app/api/mailboxes/push/google/route";

let privateKey: CryptoKey;
let jwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
});

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  if (String(input) === "https://www.googleapis.com/oauth2/v3/certs") {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
  }
  return new Response("unexpected", { status: 500 });
});

async function token(claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ email: SA, email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer("https://accounts.google.com")
    .setAudience((claims.aud as string) ?? AUD)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

function pushBody(note: Record<string, unknown>): string {
  return JSON.stringify({
    message: { data: Buffer.from(JSON.stringify(note)).toString("base64"), messageId: "1", publishTime: "2026-11-13T10:00:00Z" },
    subscription: "projects/unreceipt-prod/subscriptions/gmail-push",
  });
}

async function push(body: string, auth: string | null): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return POST(new Request("https://app.unreceipt.com/api/mailboxes/push/google", { method: "POST", headers, body }));
}

const conn = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  user_id: "11111111-1111-4111-8111-111111111111",
  provider: "google",
  email: "anna@gmail.com",
  refresh_token_enc: "v1.secret",
  status: "active",
  cursor: "1000",
  watch_id: null,
  watch_expires_at: null,
  last_sync_at: null,
  last_receipt_at: null,
  last_error: null,
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:00:00Z",
  ...over,
});

beforeEach(() => {
  process.env.GOOGLE_PUBSUB_PUSH_AUDIENCE = AUD;
  process.env.GOOGLE_PUBSUB_SA_EMAIL = SA;
  vi.stubGlobal("fetch", fetchMock);
  mocks.afterTasks = [];
  mocks.sync.mockReset();
  mocks.sync.mockResolvedValue({ skipped: false, advanced: true, cursor: "1005", processed: 1, created: 1 });
  mocks.db = createFakeDb({
    mailbox_connections: [
      conn({ id: "a", user_id: "u1" }),
      // The same address connected by a second user.
      conn({ id: "b", user_id: "u2", cursor: "2000" }),
      conn({ id: "c", user_id: "u3", status: "needs_reconnect" }),
      conn({ id: "d", provider: "microsoft" }),
      conn({ id: "e", email: "other@gmail.com" }),
    ],
  });
});

describe("POST /api/mailboxes/push/google", () => {
  it("answers 204 and syncs every active Gmail connection of the address", async () => {
    const res = await push(pushBody({ emailAddress: "Anna@Gmail.com", historyId: 1500 }), `Bearer ${await token()}`);
    expect(res.status).toBe(204);
    await Promise.all(mocks.afterTasks);
    // "b" already read past 1500.
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    const [synced, opts] = mocks.sync.mock.calls[0];
    expect(synced).toMatchObject({ id: "a", provider: "google" });
    // The row as adapters see it: never the token.
    expect(synced).not.toHaveProperty("refresh_token_enc");
    expect(opts.deadline).toBeGreaterThan(Date.now());
  });

  it("syncs when the notification is newer than every cursor", async () => {
    await push(pushBody({ emailAddress: "anna@gmail.com", historyId: "2500" }), `Bearer ${await token()}`);
    await Promise.all(mocks.afterTasks);
    expect(mocks.sync.mock.calls.map(([c]) => c.id)).toEqual(["a", "b"]);
  });

  it("acknowledges an unknown address and an unreadable body without syncing", async () => {
    const auth = `Bearer ${await token()}`;
    expect((await push(pushBody({ emailAddress: "nobody@gmail.com", historyId: 5 }), auth)).status).toBe(204);
    expect((await push("not json", auth)).status).toBe(204);
    expect((await push(JSON.stringify({ message: { data: "!!" } }), auth)).status).toBe(204);
    expect((await push(pushBody({ historyId: 5 }), auth)).status).toBe(204);
    await Promise.all(mocks.afterTasks);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("refuses a missing or forged token (401) and another subscription's token (403)", async () => {
    const body = pushBody({ emailAddress: "anna@gmail.com", historyId: 5000 });
    expect((await push(body, null)).status).toBe(401);
    expect((await push(body, "Bearer a.b.c")).status).toBe(401);
    expect((await push(body, `Bearer ${await token({ aud: "https://elsewhere.example" })}`)).status).toBe(403);
    expect((await push(body, `Bearer ${await token({ email: "x@evil.iam.gserviceaccount.com" })}`)).status).toBe(403);
    await Promise.all(mocks.afterTasks);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("refuses every push while unconfigured (503)", async () => {
    delete process.env.GOOGLE_PUBSUB_PUSH_AUDIENCE;
    const res = await push(pushBody({ emailAddress: "anna@gmail.com", historyId: 5000 }), `Bearer ${await token()}`);
    expect(res.status).toBe(503);
  });

  it("asks Pub/Sub to retry when the connections can't be read", async () => {
    mocks.db.failNext.mailbox_connections = { code: "57014", message: "timeout" };
    const res = await push(pushBody({ emailAddress: "anna@gmail.com", historyId: 5000 }), `Bearer ${await token()}`);
    expect(res.status).toBe(503);
  });

  it("keeps going when one connection's sync fails", async () => {
    mocks.sync.mockRejectedValueOnce(new Error("gmail down"));
    await push(pushBody({ emailAddress: "anna@gmail.com", historyId: "9999" }), `Bearer ${await token()}`);
    await Promise.all(mocks.afterTasks);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });
});
