// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/mailboxes/__tests__/fake-db";
import type { MobileMailboxes } from "@/lib/mobile/types";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("@/lib/mailboxes/__tests__/fake-db").createFakeDb>,
  user: null as { id: string } | null,
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => mocks.db.client.from(t) }) }));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/mailboxes/google", async () => ({
  googleProvider: (await import("@/lib/mailboxes/__tests__/fake-provider")).fakeProvider,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "@/app/api/mobile/mailboxes/route";
import { GET as webGET } from "@/app/api/mailboxes/route";

const row = (userId: string, id: string, email: string, status = "active") => ({
  id,
  user_id: userId,
  provider: "google",
  email,
  refresh_token_enc: "v1.x.y.z",
  status,
  cursor: "12345",
  watch_id: null,
  watch_expires_at: null,
  last_sync_at: "2026-11-12T08:00:00Z",
  last_receipt_at: null,
  last_error: "watch_failed",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});

beforeEach(() => {
  process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
  mocks.user = { id: USER };
  mocks.db = createFakeDb({
    mailbox_connections: [
      row(USER, "00000000-0000-4000-8000-000000000001", "anna@gmail.com"),
      row(USER, "00000000-0000-4000-8000-000000000002", "anna@firma.se", "needs_reconnect"),
      row(OTHER, "00000000-0000-4000-8000-000000000003", "eve@gmail.com"),
    ],
  });
});

describe("GET /api/mobile/mailboxes", () => {
  it("answers 401 without a signed-in user", async () => {
    mocks.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lists the caller's mailboxes, the providers and the limit, never a token, cursor or error code", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = (await res.json()) as MobileMailboxes;
    expect(body).toEqual({
      connections: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          provider: "google",
          email: "anna@gmail.com",
          status: "active",
          lastReceiptAt: null,
          lastSyncAt: "2026-11-12T08:00:00Z",
          createdAt: "2026-11-01T00:00:00Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          provider: "google",
          email: "anna@firma.se",
          status: "needs_reconnect",
          lastReceiptAt: null,
          lastSyncAt: "2026-11-12T08:00:00Z",
          createdAt: "2026-11-01T00:00:00Z",
        },
      ],
      providers: { google: true, microsoft: false },
      limit: 5,
    });
    expect(JSON.stringify(body)).not.toMatch(/v1\.x|12345|watch_failed|eve@/);
    // The website's list answers the same body.
    expect(await (await webGET()).json()).toEqual(body);
  });

  it("answers 500 on a database error", async () => {
    mocks.db.failNext.mailbox_connections = { code: "XX000", message: "down" };
    expect((await GET()).status).toBe(500);
  });
});
