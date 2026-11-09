// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireFirmMember: vi.fn(),
  requireFirmClientAccess: vi.fn(),
  update: vi.fn(),
  filters: [] as [string, unknown][],
  payload: null as unknown,
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
        mocks.payload = payload;
        const chain = {
          eq: (c: string, v: unknown) => (mocks.filters.push([c, v]), chain),
          select: () => mocks.update(),
        };
        return chain;
      },
    }),
  }),
}));

import { FirmAuthError } from "@/lib/require-firm";
import { PATCH } from "@/app/api/firm/clients/[orgId]/reminders/route";

const ORG = "33333333-3333-4333-8333-333333333333";
const patch = (body: unknown) =>
  PATCH(
    new NextRequest(`https://app.unreceipt.com/api/firm/clients/${ORG}/reminders`, {
      method: "PATCH",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orgId: ORG }) }
  );

beforeEach(() => {
  mocks.requireFirmMember.mockReset().mockResolvedValue({ user: { id: "u" }, firmId: "firm-1" });
  mocks.requireFirmClientAccess.mockReset().mockResolvedValue({ firmClientId: "fc-1", organizationId: ORG, clientName: "Acme" });
  mocks.update.mockReset().mockResolvedValue({ data: [{ id: "fc-1" }], error: null });
  mocks.filters = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/firm/clients/[orgId]/reminders", () => {
  it("switches this firm's active link only", async () => {
    const res = await patch({ weekly: false });
    expect(res.status).toBe(200);
    expect(mocks.payload).toEqual({ weekly_reminder: false });
    expect(mocks.filters).toEqual([
      ["id", "fc-1"],
      ["firm_id", "firm-1"],
      ["organization_id", ORG],
      ["status", "active"],
    ]);
  });

  it("validates the body and answers 404 for an unlinked client", async () => {
    expect((await patch({ weekly: "no" })).status).toBe(400);
    mocks.requireFirmClientAccess.mockRejectedValue(new FirmAuthError("no_access"));
    expect((await patch({ weekly: true })).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
