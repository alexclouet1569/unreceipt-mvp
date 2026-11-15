import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  analyticsAccess: vi.fn(),
  ensureHomeAmounts: vi.fn(),
  rateLimit: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  homeCurrencyOf: vi.fn(async () => "EUR"),
  // Who the real loadReceiptForActor() would say may see the row.
  firmMayRead: true,
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/analytics/load", () => ({ analyticsAccess: mocks.analyticsAccess }));
vi.mock("@/lib/fx", () => ({ ensureHomeAmounts: mocks.ensureHomeAmounts, homeCurrencyOf: mocks.homeCurrencyOf }));
// The owner / firm / mailbox-visibility rules are loadReceiptForActor()'s
// own (tested in src/lib/receipts/__tests__/access.test.ts): here, a row of
// another user is the firm's when firmMayRead says so.
vi.mock("@/lib/receipts/access", () => ({
  loadReceiptForActor: async (user: { id: string }, id: string) => {
    mocks.eq("id", id);
    const r = (await mocks.maybeSingle()) as { data: Record<string, unknown> | null; error?: unknown };
    // The real loader throws ReceiptAccessError on a failed read.
    if (r?.error) throw new Error("read failed");
    if (!r?.data) return null;
    if (r.data.user_id === user.id) return { receipt: r.data, via: "owner" };
    return mocks.firmMayRead ? { receipt: r.data, via: "firm", firmId: "firm-1" } : null;
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => {
  const chain = {
    select: () => chain,
    eq: (col: string, val: string) => {
      mocks.eq(col, val);
      return chain;
    },
    maybeSingle: () => mocks.maybeSingle(),
  };
  return { getSupabaseAdmin: () => ({ from: () => chain }) };
});

import { GET } from "@/app/api/mobile/receipts/[id]/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@firma.se" };
const ID = "22222222-2222-4222-8222-222222222222";
const call = (id: string) =>
  GET(new Request(`https://app.unreceipt.com/api/mobile/receipts/${id}`), { params: Promise.resolve({ id }) });

const row = {
  id: ID,
  user_id: USER.id,
  merchant_name: "Hemköp",
  category: "meals",
  currency: "SEK",
  total: 181.77,
  tax_amount: 19.47,
  tax_rate: 12,
  vat_lines: [{ rate: 12, net: 162.3, vat: 19.47 }],
  items: [{ label: "Banan", qty: 2, unit_amount: 11.48, total_amount: 22.96 }],
  tip_amount: 0,
  purchased_at: "2026-11-08T12:00:00Z",
  receipt_date: "2026-11-08",
  receipt_time: "12:00",
  status: "verified",
  is_verified: false,
  edited_at: null,
  notes: null,
  source: "paper",
  verification_code: "SECRET",
  image_url: `${USER.id}/x.jpg`,
  fx_source: null,
  fx_date: null,
  created_at: "2026-11-08T12:00:01Z",
} as unknown as Receipt;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(USER);
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.analyticsAccess.mockResolvedValue({ kind: "ready", home: "SEK", country: "SE" });
  mocks.ensureHomeAmounts.mockImplementation(async (rows: Receipt[]) => rows);
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null });
});

describe("GET /api/mobile/receipts/[id]", () => {
  it("answers 401 without a signed-in user, before reading anything", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    expect((await call(ID)).status).toBe(401);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed id without reading", async () => {
    expect((await call("not-a-uuid")).status).toBe(404);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("reads the receipt through the owner / firm rules", async () => {
    await call(ID);
    expect(mocks.eq).toHaveBeenCalledWith("id", ID);
  });

  it("shows a client's receipt to its accounting firm, in the client's currency, without a plan check", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...row, user_id: "someone-else", organization_id: "org-9" }, error: null });
    mocks.firmMayRead = true;
    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(mocks.homeCurrencyOf).toHaveBeenCalledWith("org-9");
    expect(mocks.analyticsAccess).not.toHaveBeenCalled();
  });

  it("answers 404 for another user's receipt the firm may not see", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...row, user_id: "someone-else", organization_id: "org-9" }, error: null });
    mocks.firmMayRead = false;
    expect((await call(ID)).status).toBe(404);
    mocks.firmMayRead = true;
  });

  it("answers 404 when the receipt isn't the user's (or doesn't exist)", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await call(ID)).status).toBe(404);
  });

  it("refuses firm-only staff and accounts without a plan", async () => {
    mocks.analyticsAccess.mockResolvedValue({ kind: "inactive" });
    expect((await call(ID)).status).toBe(403);
  });

  it("is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 10 });
    expect((await call(ID)).status).toBe(429);
  });

  it("returns the digital receipt's display fields, never storage paths or codes", async () => {
    const res = await call(ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.receipt.id).toBe(ID);
    expect(body.items).toEqual([{ label: "Banan", qty: 2, unitAmount: 11.48, total: 22.96 }]);
    expect(body.vat).toBe(19.47);
    expect(body.net).toBe(162.3);
    expect(body.vatLines).toEqual([]);
    expect(body.tip).toBeNull();
    expect(body.stamp).toBe("checked");
    expect(body.pdfReady).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("x.jpg");
  });

  it("stamps a receipt waiting for review, and says its PDF isn't ready", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...row, status: "pending_review", source: "email" }, error: null });
    const body = await (await call(ID)).json();
    expect(body.stamp).toBe("review");
    expect(body.pdfReady).toBe(false);
  });

  it("answers 500 when the read fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("db") });
    expect((await call(ID)).status).toBe(500);
  });
});
