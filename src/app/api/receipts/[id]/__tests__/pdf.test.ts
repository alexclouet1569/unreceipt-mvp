// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mocks.getServerUser,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [],
      set: () => {},
    }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mocks.maybeSingle(),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "u@x.com" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { GET } from "@/app/api/receipts/[id]/pdf/route";

function req() {
  return new NextRequest(
    `http://localhost:3000/api/receipts/${RECEIPT_ID}/pdf`,
    { method: "GET" },
  );
}

function params() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("GET /api/receipts/[id]/pdf", () => {
  it("returns 401 when no user session is present", async () => {
    mocks.getServerUser.mockResolvedValueOnce(null);
    const res = await GET(req(), params());
    expect(res.status).toBe(401);
  });

  it("returns 409 with review_required + missing_fields when the row is pending_review", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        user_id: USER_ID,
        status: "pending_review",
        merchant_name: null,
        purchased_at: "2026-05-12T08:30:00.000Z",
        receipt_date: "2026-05-12",
        total: null,
        currency: "EUR",
      },
      error: null,
    });

    const res = await GET(req(), params());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("review_required");
    expect(json.missing_fields.sort()).toEqual(["merchant", "total"]);
  });

  it("returns 200 with attachment headers when the row is verified", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        user_id: USER_ID,
        status: "verified",
        merchant_name: "Uber",
        purchased_at: "2026-05-12T08:30:00.000Z",
        receipt_date: "2026-05-12",
        total: 12.4,
        currency: "EUR",
        tax_amount: null,
        payment_method: null,
        verification_code: null,
      },
      error: null,
    });

    const res = await GET(req(), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });

  it("returns 404 when the row does not exist or RLS hides it", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
  });

  it("rejects malformed ids before hitting the database", async () => {
    const badParams = { params: Promise.resolve({ id: "not-a-uuid" }) };
    const res = await GET(req(), badParams);
    expect(res.status).toBe(400);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
});
