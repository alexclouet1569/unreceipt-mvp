import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  analyticsAccess: vi.fn(),
  searchReceipts: vi.fn(),
  ensureHomeAmounts: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/analytics/load", () => ({ analyticsAccess: mocks.analyticsAccess }));
vi.mock("@/lib/home/search", async (orig) => ({
  ...(await orig<typeof import("@/lib/home/search")>()),
  searchReceipts: mocks.searchReceipts,
}));
vi.mock("@/lib/fx", () => ({ ensureHomeAmounts: mocks.ensureHomeAmounts }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));

import { GET } from "@/app/api/receipts/search/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@firma.se" };
const req = (q: string) => new Request(`https://app.unreceipt.com/api/receipts/search${q}`);
const row = { id: "r1", user_id: USER.id, merchant_name: "ICA", total: 49.5, currency: "SEK" } as unknown as Receipt;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(USER);
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.analyticsAccess.mockResolvedValue({ kind: "ready", home: "SEK", country: "SE" });
  mocks.searchReceipts.mockResolvedValue({ receipts: [row], hasMore: true });
  mocks.ensureHomeAmounts.mockImplementation(async (rows: Receipt[]) => rows);
});

describe("GET /api/receipts/search", () => {
  it("answers 401 without a signed-in user", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    expect((await GET(req("?q=ica"))).status).toBe(401);
    expect(mocks.searchReceipts).not.toHaveBeenCalled();
  });

  it("refuses an empty search, a malformed period or cursor, before counting or reading", async () => {
    for (const q of ["", "?q=%20%20", "?month=2026-13", "?q=ica&after=nope"]) {
      expect((await GET(req(q))).status, q).toBe(400);
    }
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.searchReceipts).not.toHaveBeenCalled();
  });

  it("is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 10 });
    expect((await GET(req("?q=ica"))).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("receiptSearch", USER.id);
  });

  it("gives nothing without access", async () => {
    mocks.analyticsAccess.mockResolvedValue({ kind: "firm_only" });
    expect((await GET(req("?q=ica"))).status).toBe(403);
    expect(mocks.searchReceipts).not.toHaveBeenCalled();
  });

  it("returns the user's matching rows converted, scoped by the session user", async () => {
    const res = await GET(req("?q=ica&year=2026"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.searchReceipts).toHaveBeenCalledWith(
      USER.id,
      { text: "ica", amount: null, period: { from: "2026-01-01", to: "2026-12-31" } },
      null,
    );
    expect(mocks.ensureHomeAmounts).toHaveBeenCalledWith([row], "SEK");
    expect(await res.json()).toEqual({ receipts: [row], hasMore: true });
  });

  it("answers 500 when the search fails", async () => {
    mocks.searchReceipts.mockRejectedValue(new Error("receipt search 42883"));
    expect((await GET(req("?q=ica"))).status).toBe(500);
  });
});
