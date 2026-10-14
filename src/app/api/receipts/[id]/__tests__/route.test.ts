// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  maybeSingle: vi.fn(),
  updateEq: vi.fn(),
  deleteEq: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => mocks.storageRemove(bucket, paths),
      }),
    },
  }),
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
      delete: () => ({
        eq: (col: string, val: string) => mocks.deleteEq(col, val),
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
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { DELETE, PATCH } from "@/app/api/receipts/[id]/route";

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

  it("verifies a low-confidence row once the user saves it with every required field", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        user_id: USER_ID,
        status: "pending_review",
        merchant_name: "Espresso House",
        purchased_at: "2026-05-10T08:14:00.000Z",
        receipt_date: "2026-05-10",
        total: 75,
        currency: "SEK",
        category: "other",
        parse_confidence: 0.7,
      },
      error: null,
    });

    const res = await PATCH(req({ merchant: "Espresso House" }), params());

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.status).toBe("verified");
    expect(payload).not.toHaveProperty("parse_confidence");
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

describe("DELETE /api/receipts/[id]", () => {
  const del = () =>
    DELETE(
      new NextRequest(`http://localhost:3000/api/receipts/${RECEIPT_ID}`, {
        method: "DELETE",
      }),
      params()
    );

  it("removes the photo and the forwarded original, then the row", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        image_url: `${USER_ID}/photo.jpg`,
        original_source_url: `${USER_ID}/${RECEIPT_ID}.eml`,
      },
      error: null,
    });

    const res = await del();

    expect(res.status).toBe(200);
    expect(mocks.storageRemove).toHaveBeenCalledWith("receipts", [`${USER_ID}/photo.jpg`]);
    expect(mocks.storageRemove).toHaveBeenCalledWith("receipt-originals", [
      `${USER_ID}/${RECEIPT_ID}.eml`,
    ]);
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", RECEIPT_ID);
    expect(mocks.storageRemove.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.deleteEq.mock.invocationCallOrder[0]
    );
  });

  it("keeps the row (so the user can retry) when a file can't be removed", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { id: RECEIPT_ID, image_url: `${USER_ID}/photo.jpg`, original_source_url: null },
      error: null,
    });
    mocks.storageRemove.mockResolvedValueOnce({ error: { message: "down" } });

    const res = await del();

    expect(res.status).toBe(500);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it("never touches files outside the caller's own folder", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        image_url: "someone-else/photo.jpg",
        original_source_url: `${USER_ID}/../someone-else/x.eml`,
      },
      error: null,
    });

    const res = await del();

    expect(res.status).toBe(200);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", RECEIPT_ID);
  });

  it("returns 404 for a row the caller can't see", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await del();

    expect(res.status).toBe(404);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });
});
