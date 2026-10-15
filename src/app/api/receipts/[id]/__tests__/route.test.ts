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

const usageMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/usage")>()),
  recordReceiptUsage: usageMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: string) => ({
          eq: (col2: string, val2: string) =>
            mocks.updateEq(payload, col, val, col2, val2),
        }),
      }),
    }),
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

    const [payload, , , scopeCol, scopeVal] = mocks.updateEq.mock.calls[0];
    expect(payload.status).toBe("verified");
    // Service-role write, so it must be scoped to the caller explicitly.
    expect([scopeCol, scopeVal]).toEqual(["user_id", USER_ID]);
    expect(payload.merchant_name).toBe("ICA Maxi");
    expect(payload.total).toBe(49);
    expect(payload.purchased_at).toBe("2026-05-12T12:00:00.000Z");
    // Confirming is when a waiting receipt counts toward the plan.
    expect(usageMock).toHaveBeenCalledWith({
      userId: USER_ID,
      receiptId: RECEIPT_ID,
      source: "manual",
    });
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

  const verifiedRow = () => ({
    id: RECEIPT_ID,
    user_id: USER_ID,
    status: "verified",
    source: "email",
    merchant_name: "Uber",
    purchased_at: "2026-05-10T08:14:00.000Z",
    receipt_date: "2026-05-10",
    total: 24.9,
    currency: "EUR",
    category: "transport",
    parse_confidence: 0.95,
    edited_at: null,
    edited_fields: null,
    edit_history: null,
  });

  it("edits a verified receipt and records what changed and when", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: verifiedRow(), error: null });

    const res = await PATCH(req({ amount: 29.9 }), params());

    expect(res.status).toBe(200);
    const [payload, , , scopeCol, scopeVal] = mocks.updateEq.mock.calls[0];
    expect([scopeCol, scopeVal]).toEqual(["user_id", USER_ID]);
    expect(payload.total).toBe(29.9);
    expect(payload.status).toBe("verified");
    expect(payload.edited_at).toEqual(expect.any(String));
    expect(payload.edited_fields).toEqual(["total"]);
    expect(payload.edit_history).toEqual([
      { at: payload.edited_at, changes: { total: { from: 24.9, to: 29.9 } } },
    ]);
  });

  it("keeps earlier edits in the history and the field list", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        ...verifiedRow(),
        total: 29.9,
        edited_at: "2026-05-11T09:00:00.000Z",
        edited_fields: ["total"],
        edit_history: [
          {
            at: "2026-05-11T09:00:00.000Z",
            changes: { total: { from: 24.9, to: 29.9 } },
          },
        ],
      },
      error: null,
    });

    const res = await PATCH(req({ merchant: "Uber BV" }), params());

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.edited_fields).toEqual(["total", "merchant_name"]);
    expect(payload.edit_history).toHaveLength(2);
    expect(payload.edit_history[1].changes).toEqual({
      merchant_name: { from: "Uber", to: "Uber BV" },
    });
  });

  it("doesn't mark the receipt as edited when nothing factual changes", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: verifiedRow(), error: null });

    // Same amount, a new category and a note: annotations, not facts.
    const res = await PATCH(
      req({ amount: 24.9, category: "travel", notes: "Airport" }),
      params(),
    );

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.category).toBe("travel");
    expect(payload.notes).toBe("Airport");
    expect(payload).not.toHaveProperty("edited_at");
    expect(payload).not.toHaveProperty("edit_history");
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
