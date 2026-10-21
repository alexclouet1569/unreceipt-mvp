// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: string) => ({
          eq: (col2: string, val2: string) => ({
            select: () => ({
              maybeSingle: () => mocks.update(table, payload, { [col]: val, [col2]: val2 }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { PATCH } from "../route";

function call(body: unknown, id = RECEIPT_ID) {
  const req = new NextRequest(`http://localhost/api/receipts/${id}/claim`, {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mocks.getServerUser.mockReset().mockResolvedValue({ id: USER_ID });
  mocks.update.mockReset().mockResolvedValue({ data: { id: RECEIPT_ID }, error: null });
});

describe("PATCH /api/receipts/[id]/claim", () => {
  it("rejects anonymous callers", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    expect((await call({ claim_type: "lunch" })).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves only the claim fields, scoped to the signed-in user", async () => {
    const res = await call({ claim_type: "dinner", claim_place: "  Brioude ", claim_purpose: "" });
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      "receipts",
      { claim_type: "dinner", claim_place: "Brioude", claim_purpose: null },
      { id: RECEIPT_ID, user_id: USER_ID },
    );
  });

  it("refuses fields other than the claim ones", async () => {
    const res = await call({ claim_type: "lunch", status: "verified" });
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses unknown types and over-long text", async () => {
    expect((await call({ claim_type: "spa" })).status).toBe(400);
    expect((await call({ claim_purpose: "x".repeat(201) })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("answers 404 for a receipt that isn't the user's", async () => {
    mocks.update.mockResolvedValue({ data: null, error: null });
    expect((await call({ claim_type: "lunch" })).status).toBe(404);
    expect((await call({ claim_type: "lunch" }, "not-a-uuid")).status).toBe(404);
  });
});
