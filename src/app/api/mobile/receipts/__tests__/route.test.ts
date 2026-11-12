import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  analyticsAccess: vi.fn(),
  loadOlderReceipts: vi.fn(),
  ensureHomeAmounts: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/analytics/load", () => ({ analyticsAccess: mocks.analyticsAccess }));
vi.mock("@/lib/home/load-home", async (orig) => ({
  ...(await orig<typeof import("@/lib/home/load-home")>()),
  loadOlderReceipts: mocks.loadOlderReceipts,
}));
vi.mock("@/lib/fx", () => ({ ensureHomeAmounts: mocks.ensureHomeAmounts }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));

import { GET } from "@/app/api/mobile/receipts/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@firma.se" };
const req = (q: string) => new Request(`https://app.unreceipt.com/api/mobile/receipts${q}`);
const KEY = "2026-01-05T12:00:00+00:00|2026-01-05T12:00:01.123456+00:00|22222222-2222-4222-8222-222222222222";
const AFTER = `?after=${encodeURIComponent(KEY)}`;

const row = {
  id: "r60",
  user_id: USER.id,
  merchant_name: "SJ",
  category: "travel",
  currency: "SEK",
  total: 495,
  purchased_at: "2025-03-02T12:00:00Z",
  receipt_date: "2025-03-02",
  status: "verified",
  notes: null,
  source: "paper",
  verification_code: "SECRET",
  created_at: "2025-03-02T12:00:01Z",
} as unknown as Receipt;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(USER);
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.analyticsAccess.mockResolvedValue({ kind: "ready", home: "SEK", country: "SE" });
  mocks.loadOlderReceipts.mockResolvedValue({ receipts: [row], hasMore: true });
  mocks.ensureHomeAmounts.mockImplementation(async (rows: Receipt[]) => rows);
});

describe("GET /api/mobile/receipts", () => {
  it("answers 401 without a signed-in user, before reading anything", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    const res = await GET(req(AFTER));
    expect(res.status).toBe(401);
    expect(mocks.loadOlderReceipts).not.toHaveBeenCalled();
  });

  it("refuses a cursor that isn't exactly a list key (its parts go into a filter)", async () => {
    const bad = [
      "",
      "?after=",
      "?after=50",
      `?after=${encodeURIComponent("x|2026-01-05T12:00:01Z|22222222-2222-4222-8222-222222222222")}`,
      `?after=${encodeURIComponent("2026-01-05T12:00:00Z|2026-01-05T12:00:01Z|not-a-uuid")}`,
      `?after=${encodeURIComponent('2026-01-05T12:00:00Z),id.gt.0|2026-01-05T12:00:01Z|22222222-2222-4222-8222-222222222222')}`,
      `?after=${encodeURIComponent("a|b|c|d")}`,
      `?after=${encodeURIComponent("2026-99-99T99:99:99Z|2026-01-05T12:00:01Z|22222222-2222-4222-8222-222222222222")}`,
      `?after=${encodeURIComponent('2026-01-05T12:00:00"Z|2026-01-05T12:00:01Z|22222222-2222-4222-8222-222222222222')}`,
      `?after=${encodeURIComponent("2026-01-05T12:00:00\\Z|2026-01-05T12:00:01Z|22222222-2222-4222-8222-222222222222")}`,
    ];
    for (const q of bad) {
      expect((await GET(req(q))).status, q).toBe(400);
    }
    expect(mocks.loadOlderReceipts).not.toHaveBeenCalled();
  });

  it("is rate-limited like Insights", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    expect((await GET(req(AFTER))).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("analytics", USER.id);
  });

  it("gives nothing to firm-only staff or accounts without a plan", async () => {
    mocks.analyticsAccess.mockResolvedValue({ kind: "inactive" });
    expect((await GET(req(AFTER))).status).toBe(403);
    expect(mocks.loadOlderReceipts).not.toHaveBeenCalled();
  });

  it("returns the user's own next page as display JSON, never internal fields", async () => {
    const res = await GET(req(AFTER));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocks.loadOlderReceipts).toHaveBeenCalledWith(USER.id, {
      purchasedAt: "2026-01-05T12:00:00+00:00",
      createdAt: "2026-01-05T12:00:01.123456+00:00",
      id: "22222222-2222-4222-8222-222222222222",
    });
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.receipts).toHaveLength(1);
    expect(body.receipts[0]).toMatchObject({ id: "r60", merchant: "SJ" });
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(JSON.stringify(body)).not.toContain(USER.id);
  });
});

describe("list cursor", () => {
  it("reads the app's list key, including an undated receipt's", async () => {
    const { parseListCursor } = await import("@/lib/home/load-home");
    expect(parseListCursor("|2026-01-05T12:00:01Z|22222222-2222-4222-8222-222222222222")).toEqual({
      purchasedAt: null,
      createdAt: "2026-01-05T12:00:01Z",
      id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("asks for rows after the cursor in the list's order, undated rows last", async () => {
    const { afterCursorFilter } = await import("@/lib/home/load-home");
    const id = "22222222-2222-4222-8222-222222222222";
    expect(afterCursorFilter({ purchasedAt: "2026-01-05T12:00:00Z", createdAt: "2026-01-05T12:00:01Z", id })).toBe(
      'purchased_at.lt."2026-01-05T12:00:00Z",' +
        'and(purchased_at.eq."2026-01-05T12:00:00Z",or(created_at.lt."2026-01-05T12:00:01Z",and(created_at.eq."2026-01-05T12:00:01Z",id.lt."' + id + '"))),' +
        "purchased_at.is.null",
    );
    expect(afterCursorFilter({ purchasedAt: null, createdAt: "2026-01-05T12:00:01Z", id })).toBe(
      'and(purchased_at.is.null,or(created_at.lt."2026-01-05T12:00:01Z",and(created_at.eq."2026-01-05T12:00:01Z",id.lt."' + id + '")))',
    );
  });
});
