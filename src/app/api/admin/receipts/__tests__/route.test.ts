import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  insert: vi.fn(),
  AdminAuthError: class extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.name = "AdminAuthError";
      this.reason = reason;
    }
  },
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mocks.requireAdmin,
  AdminAuthError: mocks.AdminAuthError,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: mocks.insert,
    }),
  }),
}));

import { POST } from "@/app/api/admin/receipts/route";

const ADMIN_USER = { id: "admin-1", email: "founder@unreceipt.io" };
// Valid v4 UUID (the variant nibble must be in [89abAB] for zod's strict
// uuid validator). gen_random_uuid() rows from Postgres always conform.
const TARGET_USER_ID = "11111111-1111-4111-8111-111111111111";

const validBody = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  user_id: TARGET_USER_ID,
  merchant: "Stripe",
  amount: 49,
  currency: "EUR",
  date: "2026-05-03",
  category: "software",
  ...overrides,
});

const buildRequest = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/admin/receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/admin/receipts", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.insert.mockReset().mockResolvedValue({ error: null });
  });

  it("returns 403 when the caller is not an admin (no DB write)", async () => {
    mocks.requireAdmin.mockRejectedValue(
      new mocks.AdminAuthError("not_admin")
    );

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 403 for an unauthenticated caller", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.AdminAuthError("no_user"));

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 200 and inserts with status='captured' source='forwarded' on a valid body", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(
      buildRequest(
        validBody({
          payment_method: "Visa •••• 4242",
          receipt_number: "INV-7",
          tax_amount: 9.8,
          tax_rate: 25,
          notes: "Forwarded from accountant.",
        })
      )
    );

    expect(res.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const row = mocks.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: TARGET_USER_ID,
      merchant_name: "Stripe",
      category: "software",
      currency: "EUR",
      total: 49,
      tax_amount: 9.8,
      tax_rate: 25,
      receipt_date: "2026-05-03",
      payment_method: "Visa •••• 4242",
      receipt_number: "INV-7",
      notes: "Forwarded from accountant.",
      source: "forwarded",
    });
  });

  it("returns 400 with zod issues when required fields are missing", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(buildRequest({ user_id: TARGET_USER_ID }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects negative amounts", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(buildRequest(validBody({ amount: -5 })));

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects unknown currencies", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(buildRequest(validBody({ currency: "XYZ" })));

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects unknown categories", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(buildRequest(validBody({ category: "rocket" })));

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects invalid date formats", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(buildRequest(validBody({ date: "tomorrow" })));

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects merchant names beyond max length", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(
      buildRequest(validBody({ merchant: "x".repeat(201) }))
    );

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects notes beyond max length", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const res = await POST(
      buildRequest(validBody({ notes: "x".repeat(2001) }))
    );

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 500 when the supabase insert errors", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);
    mocks.insert.mockResolvedValue({ error: { message: "DB exploded" } });

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when the request body isn't valid JSON", async () => {
    mocks.requireAdmin.mockResolvedValue(ADMIN_USER);

    const req = new NextRequest("http://localhost:3000/api/admin/receipts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
