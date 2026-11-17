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
  // Other receipts sharing a scanned PDF (count query).
  scanSharers: 0,
  updateFilters: [] as Array<Array<[string, string, unknown]>>,
  getEmployment: vi.fn(),
  logApproval: vi.fn(async () => {}),
}));

// An employee's receipt (2026-11-15 team block): the route checks they
// still work for the receipt's company, and logs a reopened approval.
vi.mock("@/lib/team/membership", () => ({ getEmployment: mocks.getEmployment }));
vi.mock("@/lib/team/decisions", () => ({ logApproval: mocks.logApproval }));

const usageMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/usage")>()),
  recordReceiptUsage: usageMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          neq: async () => ({ count: mocks.scanSharers, error: null }),
        };
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        // eq(id), eq(user_id), then the compare-and-set filters, then
        // select("id"). Every filter is kept in mocks.updateFilters.
        const filters: Array<[string, string, unknown]> = [];
        const chain = {
          eq: (col: string, val: unknown) => (filters.push(["eq", col, val]), chain),
          is: (col: string, val: unknown) => (filters.push(["is", col, val]), chain),
          select: async () => {
            mocks.updateFilters.push(filters);
            const [[, col, val], [, col2, val2]] = filters;
            const r = (await mocks.updateEq(payload, col, val, col2, val2)) as { error: unknown; none?: boolean };
            if (r?.none) return { data: [], error: null };
            return { data: r?.error ? null : [{ id: val }], error: r?.error ?? null };
          },
        };
        return chain;
      },
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
  getUserSupabase: async () => userScopedClient(),
}));

// PATCH reads through loadReceiptForActor(); DELETE still reads under RLS.
vi.mock("@/lib/receipts/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/receipts/access")>();
  return {
    ...actual,
    loadReceiptForActor: async (user: { id: string }) => {
      const r = (await mocks.maybeSingle()) as { data: Record<string, unknown> | null; error: unknown };
      if (r?.error) throw new actual.ReceiptAccessError();
      if (!r?.data) return null;
      return r.data.user_id === user.id
        ? { receipt: r.data, via: "owner" }
        : { receipt: r.data, via: "firm", firmId: "firm-1" };
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [],
      set: () => {},
    }),
}));

// The caller-scoped client (RLS) the DELETE handler reads and deletes with.
function userScopedClient() {
  return {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "u@x.com" });
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ error: null });
  mocks.updateFilters.length = 0;
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
      {
        at: payload.edited_at,
        by: USER_ID,
        changes: { total: { from: 24.9, to: 29.9 } },
      },
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

  it("edits VAT, payment method and line items, recording each change", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...verifiedRow(), tax_amount: null, tax_rate: null, payment_method: null, items: null },
      error: null,
    });
    const items = [{ label: "Ride", qty: null, unit_amount: null, total_amount: 24.9 }];

    const res = await PATCH(
      req({ tax_amount: 2.67, tax_rate: 12, payment_method: "Card", items }),
      params(),
    );

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload).toMatchObject({
      tax_amount: 2.67,
      tax_rate: 12,
      payment_method: "Card",
      items,
    });
    expect(payload.edited_fields).toEqual([
      "tax_amount",
      "tax_rate",
      "payment_method",
      "items",
    ]);
  });

  it("clears VAT with null and stores an empty item list as null", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...verifiedRow(), tax_amount: 5, items: [{ label: "x", total_amount: 1 }] },
      error: null,
    });

    const res = await PATCH(req({ tax_amount: null, items: [] }), params());

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.tax_amount).toBeNull();
    expect(payload.items).toBeNull();
  });

  it("rejects VAT above the resulting total", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...verifiedRow(), tax_amount: 4 },
      error: null,
    });

    // Lowering the total below the stored VAT is refused too.
    const res = await PATCH(req({ amount: 3 }), params());

    expect(res.status).toBe(400);
    expect((await res.json()).issues[0].path).toBe("tax_amount");
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });

  it("rejects a VAT rate above 100 and an item without a label", async () => {
    expect((await PATCH(req({ tax_rate: 101 }), params())).status).toBe(400);
    expect(
      (await PATCH(req({ items: [{ label: "", total_amount: 1 }] }), params())).status,
    ).toBe(400);
    expect(mocks.updateEq).not.toHaveBeenCalled();
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

  describe("the BAS account alone (the firm's bookkeeping field)", () => {
    const FIRM_USER = "33333333-3333-4333-8333-333333333333";
    const toConfirm = {
      id: RECEIPT_ID,
      user_id: USER_ID,
      status: "pending_review",
      merchant_name: "Circle K",
      purchased_at: "2026-11-03T12:00:00.000Z",
      receipt_date: "2026-11-03",
      total: 812,
      currency: "SEK",
      category: "transport",
      parse_confidence: 0.9,
      approval_status: null,
    };

    it("saves the account and leaves an unconfirmed receipt unconfirmed", async () => {
      mocks.getServerUser.mockResolvedValueOnce({ id: FIRM_USER, email: "a@firm.se" });
      mocks.maybeSingle.mockResolvedValueOnce({ data: toConfirm, error: null });

      const res = await PATCH(req({ bas_account: "5611" }), params());

      expect(res.status).toBe(200);
      const [payload, , , scopeCol, scopeVal] = mocks.updateEq.mock.calls[0];
      expect(payload.bas_account).toBe("5611");
      expect(payload).not.toHaveProperty("status");
      // Written for the receipt's owner, never the firm user.
      expect([scopeCol, scopeVal]).toEqual(["user_id", USER_ID]);
      // Not a confirmation: nothing is counted toward the plan.
      expect(usageMock).not.toHaveBeenCalled();
      expect((await res.json()).status).toBe("pending_review");
    });

    it("clears the account with null (back to the category suggestion)", async () => {
      mocks.maybeSingle.mockResolvedValueOnce({
        data: { ...toConfirm, status: "verified", bas_account: "5611" },
        error: null,
      });

      const res = await PATCH(req({ bas_account: null }), params());

      expect(res.status).toBe(200);
      const [payload] = mocks.updateEq.mock.calls[0];
      expect(payload.bas_account).toBeNull();
      expect(payload).not.toHaveProperty("status");
      expect((await res.json()).status).toBe("verified");
    });

    it("refuses an account that isn't 4 digits", async () => {
      const res = await PATCH(req({ bas_account: "56A1" }), params());
      expect(res.status).toBe(400);
      expect(mocks.updateEq).not.toHaveBeenCalled();
    });

    it("still confirms on an empty save (Confirm receipt with nothing changed)", async () => {
      mocks.maybeSingle.mockResolvedValueOnce({ data: toConfirm, error: null });

      const res = await PATCH(req({}), params());

      expect(res.status).toBe(200);
      const [payload] = mocks.updateEq.mock.calls[0];
      expect(payload.status).toBe("verified");
    });
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

  it("keeps a scanned PDF other page receipts still use, and removes it with the last one", async () => {
    const scan = `${USER_ID}/scans/22222222-2222-4222-8222-222222222222.pdf`;
    const row = { data: { id: RECEIPT_ID, image_url: `${USER_ID}/page.pdf`, original_source_url: scan }, error: null };

    mocks.scanSharers = 2;
    mocks.maybeSingle.mockResolvedValueOnce(row);
    expect((await del()).status).toBe(200);
    expect(mocks.storageRemove).toHaveBeenCalledWith("receipts", [`${USER_ID}/page.pdf`]);
    expect(mocks.storageRemove).not.toHaveBeenCalledWith("receipt-originals", [scan]);

    mocks.scanSharers = 0;
    mocks.maybeSingle.mockResolvedValueOnce(row);
    expect((await del()).status).toBe(200);
    expect(mocks.storageRemove).toHaveBeenCalledWith("receipt-originals", [scan]);
  });

  it("returns 404 for a row the caller can't see", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await del();

    expect(res.status).toBe(404);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/receipts/[id] by the client's accounting firm", () => {
  const STAFF_ID = "33333333-3333-4333-8333-333333333333";

  it("writes scoped to the row's owner and counts usage for the client, not the accountant", async () => {
    mocks.getServerUser.mockResolvedValue({ id: STAFF_ID, email: "eva@byran.se" });
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        user_id: USER_ID,
        organization_id: "org-1",
        status: "pending_review",
        merchant_name: null,
        purchased_at: null,
        receipt_date: null,
        total: 120,
        source: "email",
        currency: "SEK",
        tax_amount: null,
        edited_fields: null,
        edit_history: null,
      },
      error: null,
    });

    const res = await PATCH(req({ merchant: "ICA", receipt_date: "2026-11-02" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "verified" });

    const [payload, , , scopeCol, scopeVal] = mocks.updateEq.mock.calls[0];
    expect([scopeCol, scopeVal]).toEqual(["user_id", USER_ID]);
    expect((payload as { edit_history: Array<{ by: string }> }).edit_history[0].by).toBe(STAFF_ID);
    expect(usageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, receiptId: RECEIPT_ID })
    );
  });

  it("answers 404 for a receipt of a company the firm isn't linked to", async () => {
    mocks.getServerUser.mockResolvedValue({ id: STAFF_ID, email: "eva@byran.se" });
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await PATCH(req({ merchant: "ICA" }), params());
    expect(res.status).toBe(404);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/receipts/[id] — bookkeeping fields", () => {
  it("accepts a VAT split, the seller's org.nr and a 4-digit BAS account", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "u@x.com" });
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: RECEIPT_ID,
        user_id: USER_ID,
        status: "verified",
        merchant_name: "ICA",
        purchased_at: "2026-11-02T12:00:00Z",
        receipt_date: "2026-11-02",
        total: 181,
        source: "paper",
        currency: "SEK",
        tax_amount: 31,
        edited_fields: null,
        edit_history: null,
      },
      error: null,
    });
    const res = await PATCH(
      req({ vat_lines: [{ rate: 25, net: 100, vat: 25 }, { rate: 12, vat: 6 }], seller_org_number: "556677-8899", bas_account: "5410" }),
      params()
    );
    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload).toMatchObject({
      vat_lines: [
        { rate: 25, net: 100, vat: 25 },
        { rate: 12, net: null, vat: 6 },
      ],
      seller_org_number: "556677-8899",
      bas_account: "5410",
    });
    expect((payload as { edited_fields: string[] }).edited_fields).toEqual(["seller_org_number", "vat_lines"]);
  });

  it("refuses a BAS account that isn't 4 digits", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "u@x.com" });
    const res = await PATCH(req({ bas_account: "54" }), params());
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/receipts/[id] — an employee's outlay already paid back", () => {
  const ORG_ID = "44444444-4444-4444-8444-444444444444";
  const FIRM_USER = "33333333-3333-4333-8333-333333333333";
  const approved = {
    id: RECEIPT_ID,
    user_id: USER_ID,
    organization_id: ORG_ID,
    status: "verified",
    merchant_name: "Taxi Stockholm",
    purchased_at: "2026-11-03T12:00:00+00:00",
    receipt_date: "2026-11-03",
    total: 420,
    currency: "SEK",
    home_total: 420,
    home_currency: "SEK",
    fx_source: "same",
    category: "transport",
    notes: null,
    tax_amount: 25.2,
    tax_rate: 6,
    // jsonb gives keys back in its own order (shortest first).
    vat_lines: [{ net: 420, vat: 25.2, rate: 6 }],
    approval_status: "approved",
    paid_by: "employee",
    reimbursed_at: "2026-11-10T09:00:00+00:00",
  };

  beforeEach(() => {
    mocks.getEmployment.mockResolvedValue({ organizationId: ORG_ID, role: "member" });
  });

  it("refuses a new amount with 409 reimbursed and writes nothing", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: approved, error: null });

    const res = await PATCH(req({ amount: 520 }), params());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("reimbursed");
    expect(mocks.updateEq).not.toHaveBeenCalled();
    expect(mocks.logApproval).not.toHaveBeenCalled();
  });

  it.each([
    ["date", { receipt_date: "2026-11-04" }],
    ["merchant", { merchant: "Uber" }],
    ["paid by", { paid_by: "company" }],
    ["VAT", { tax_amount: 20, vat_lines: [{ rate: 6, net: 400, vat: 20 }] }],
    ["home amount cleared", { home_total: null }],
  ])("refuses a change of %s", async (_label, body) => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: approved, error: null });
    const res = await PATCH(req(body), params());
    expect(res.status).toBe(409);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });

  it("still saves notes and category, without reopening approval", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: approved, error: null });

    const res = await PATCH(req({ notes: "Airport run", category: "travel" }), params());

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.notes).toBe("Airport run");
    expect(payload).not.toHaveProperty("approval_status");
    expect(mocks.logApproval).not.toHaveBeenCalled();
  });

  it("treats the same amount, VAT and VAT lines saved again as no change", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: approved, error: null });

    const res = await PATCH(
      req({ amount: 420, tax_amount: 25.2, vat_lines: [{ rate: 6, net: 420, vat: 25.2 }] }),
      params()
    );

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload).not.toHaveProperty("approval_status");
  });

  it("treats the same day sent again by the date sheet as no change", async () => {
    // Stored with the database's "+00:00" and its own clock time.
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...approved, purchased_at: "2026-11-03T14:23:00+00:00" },
      error: null,
    });

    const res = await PATCH(req({ receipt_date: "2026-11-03" }), params());

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload).not.toHaveProperty("purchased_at");
    expect(payload).not.toHaveProperty("home_total");
    expect(payload).not.toHaveProperty("approval_status");
  });

  it("lets the accounting firm correct it (founder decision 2026-11-17)", async () => {
    mocks.getServerUser.mockResolvedValueOnce({ id: FIRM_USER, email: "a@firm.se" });
    mocks.maybeSingle.mockResolvedValueOnce({ data: approved, error: null });

    const res = await PATCH(req({ amount: 520 }), params());

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.total).toBe(520);
    expect(payload).not.toHaveProperty("approval_status");
  });

  it("reopens an approved outlay not paid back yet, only if no payment lands meanwhile", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { ...approved, reimbursed_at: null }, error: null });

    const res = await PATCH(req({ amount: 520 }), params());

    expect(res.status).toBe(200);
    const [payload] = mocks.updateEq.mock.calls[0];
    expect(payload.approval_status).toBe("submitted");
    expect(mocks.updateFilters[0]).toContainEqual(["eq", "approval_status", "approved"]);
    expect(mocks.updateFilters[0]).toContainEqual(["is", "reimbursed_at", null]);
    expect(mocks.logApproval).toHaveBeenCalledWith(expect.objectContaining({ id: RECEIPT_ID }), USER_ID, "reopened", null);
  });

  it("answers 409 changed when the payment was recorded between the read and the write", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { ...approved, reimbursed_at: null }, error: null });
    // The compare-and-set matched no row.
    mocks.updateEq.mockResolvedValueOnce({ error: null, none: true });

    const res = await PATCH(req({ amount: 520 }), params());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("changed");
    expect(mocks.logApproval).not.toHaveBeenCalled();
  });
});
