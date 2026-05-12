// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  maybeSingle: vi.fn(),
  updateEq: vi.fn(),
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
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: string) => mocks.updateEq(payload, col, val),
      }),
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "u@x.com" });
  mocks.updateEq.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { PATCH } from "@/app/api/receipts/[id]/route";

function req(body: unknown) {
  return new NextRequest(`http://localhost:3000/api/receipts/${RECEIPT_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: RECEIPT_ID }) };
}

describe("PATCH /api/receipts/[id]", () => {
  it("returns 401 when no user session is present", async () => {
    mocks.getServerUser.mockResolvedValueOnce(null);
    const res = await PATCH(req({ merchant: "Uber" }), params());
    expect(res.status).toBe(401);
  });

  it("flips a pending_review row to 'verified' when the patch fills the missing fields", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        user_id: USER_ID,
        status: "pending_review",
        merchant_name: null,
        purchased_at: null,
        receipt_date: null,
        total: null,
        currency: "EUR",
        category: "other",
        parse_confidence: null,
      },
      error: null,
    });

    const res = await PATCH(
      req({
        merchant: "ICA Maxi",
        amount: 49,
        currency: "EUR",
        receipt_date: "2026-05-12",
        category: "meals",
      }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateEq).toHaveBeenCalledTimes(1);

    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.status).toBe("verified");
    expect(payload.merchant_name).toBe("ICA Maxi");
    expect(payload.total).toBe(49);
    expect(payload.purchased_at).toBe("2026-05-12T12:00:00.000Z");
  });

  it("keeps status as 'pending_review' when a required field is still missing after the patch", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        user_id: USER_ID,
        status: "pending_review",
        merchant_name: null,
        purchased_at: null,
        receipt_date: null,
        total: null,
        currency: "EUR",
        category: "other",
        parse_confidence: null,
      },
      error: null,
    });

    // Only fills merchant — amount + date still missing.
    const res = await PATCH(req({ merchant: "ICA Maxi" }), params());
    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.status).toBe("pending_review");
  });

  it("returns 404 when the row is not visible (RLS or missing)", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await PATCH(req({ merchant: "Uber" }), params());
    expect(res.status).toBe(404);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads with 400", async () => {
    const res = await PATCH(req({ amount: -1 }), params());
    expect(res.status).toBe(400);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });
});
