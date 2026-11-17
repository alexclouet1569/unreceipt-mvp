// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  extract: vi.fn(),
  download: vi.fn(),
  updated: null as Record<string, unknown> | null,
  filters: [] as Array<[string, string, unknown]>,
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: async () => ({ id: USER_ID, email: "anna@x.se" }),
  getUserSupabase: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.row, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/subscription-gate", () => ({
  hasProductAccess: async () => true,
  subscriptionRequiredResponse: () => new Response(null, { status: 402 }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true }),
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/ocr", () => ({ extractReceipt: m.extract }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ download: m.download }) },
    from: () => ({
      update: () => {
        const chain = {
          eq: (c: string, v: unknown) => (m.filters.push(["eq", c, v]), chain),
          is: (c: string, v: unknown) => (m.filters.push(["is", c, v]), chain),
          select: () => ({ maybeSingle: async () => ({ data: m.updated, error: null }) }),
        };
        return chain;
      },
    }),
  }),
}));

import { POST } from "@/app/api/receipts/[id]/reprocess/route";

const call = () =>
  POST(new NextRequest(`http://localhost:3000/api/receipts/${RECEIPT_ID}/reprocess`, { method: "POST" }), {
    params: Promise.resolve({ id: RECEIPT_ID }),
  });

const row = (over: Record<string, unknown>) => ({
  id: RECEIPT_ID,
  user_id: USER_ID,
  status: "verified",
  merchant_name: "Taxi Stockholm",
  total: 420,
  currency: "SEK",
  receipt_date: "2026-11-03",
  purchased_at: "2026-11-03T12:00:00+00:00",
  parse_confidence: 0.7,
  items: null,
  image_url: `${USER_ID}/receipt.jpg`,
  original_source_url: null,
  edited_fields: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.filters.length = 0;
  m.updated = null;
  m.download.mockResolvedValue({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), error: null });
  m.extract.mockResolvedValue({ merchant: "Taxi Sthlm", total_amount: 520, currency: "SEK", confidence: 0.9 });
});

describe("POST /api/receipts/[id]/reprocess and an employee's approval", () => {
  it.each(["submitted", "approved", "rejected"])("refuses a receipt %s, before reading it", async (state) => {
    m.row = row({ approval_status: state, paid_by: "employee", reimbursed_at: "2026-11-10T09:00:00+00:00" });

    const res = await call();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("in_approval");
    expect(m.extract).not.toHaveBeenCalled();
    expect(m.filters).toHaveLength(0);
  });

  it("re-reads a draft, only while it is still a draft", async () => {
    m.row = row({ approval_status: "draft" });
    m.updated = { ...m.row };

    const res = await call();

    expect(res.status).toBe(200);
    expect(m.filters).toContainEqual(["eq", "approval_status", "draft"]);
  });

  it("answers 409 changed when it was sent for approval meanwhile", async () => {
    m.row = row({ approval_status: "draft" });
    m.updated = null;

    const res = await call();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("changed");
  });

  it("keeps a receipt outside any team as before", async () => {
    m.row = row({ approval_status: null });
    m.updated = { ...m.row };

    const res = await call();

    expect(res.status).toBe(200);
    expect(m.filters).toContainEqual(["is", "approval_status", null]);
  });
});
