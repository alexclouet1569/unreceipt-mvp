// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireFirmMember: vi.fn(),
  requireFirmClientAccess: vi.fn(),
  update: vi.fn(),
  filters: [] as [string, unknown][],
}));

vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: mocks.requireFirmMember,
  requireFirmClientAccess: mocks.requireFirmClientAccess,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (payload: unknown) => {
        const chain = {
          in: (c: string, v: unknown) => {
            mocks.filters.push([c, v]);
            return chain;
          },
          eq: (c: string, v: unknown) => {
            mocks.filters.push([c, v]);
            return chain;
          },
          select: () => mocks.update(payload),
        };
        return chain;
      },
    }),
  }),
}));

import { FirmAuthError } from "@/lib/require-firm";
import { POST } from "@/app/api/firm/clients/[orgId]/receipts/book/route";

const ORG = "33333333-3333-4333-8333-333333333333";
const R1 = "22222222-2222-4222-8222-222222222222";
const CTX = { user: { id: "u-staff" }, memberId: "fm-1", firmId: "firm-1", firmName: "Byrån", role: "staff" };

const post = (body: unknown) =>
  POST(new NextRequest(`https://app.unreceipt.com/api/firm/clients/${ORG}/receipts/book`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "app.unreceipt.com" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ orgId: ORG }) });

beforeEach(() => {
  mocks.requireFirmMember.mockReset().mockResolvedValue(CTX);
  mocks.requireFirmClientAccess.mockReset().mockResolvedValue({ firmClientId: "fc", organizationId: ORG, clientName: "Acme" });
  mocks.update.mockReset().mockResolvedValue({ data: [{ id: R1 }], error: null });
  mocks.filters = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/firm/clients/[orgId]/receipts/book", () => {
  it("marks receipts booked, scoped to the checked organisation", async () => {
    const res = await post({ receiptIds: [R1], ref: " A 12 " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 1 });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ booked_by: "u-staff", booked_ref: "A 12" });
    expect(mocks.filters).toEqual([["id", [R1]], ["organization_id", ORG]]);
  });

  it("clears the mark", async () => {
    await post({ receiptIds: [R1], booked: false });
    expect(mocks.update.mock.calls[0][0]).toEqual({ booked_at: null, booked_by: null, booked_ref: null });
  });

  it("validates ids and answers 404 for a client the firm isn't linked to", async () => {
    expect((await post({ receiptIds: ["nope"] })).status).toBe(400);
    expect((await post({ receiptIds: [] })).status).toBe(400);
    mocks.requireFirmClientAccess.mockRejectedValue(new FirmAuthError("no_access"));
    expect((await post({ receiptIds: [R1] })).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
