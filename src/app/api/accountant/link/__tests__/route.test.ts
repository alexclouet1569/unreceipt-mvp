// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: { id: "u-owner" } as { id: string } | null,
  memberFilters: [] as Array<[string, unknown]>,
  memberships: [{ organization_id: "org-1" }] as Array<{ organization_id: string }>,
  updatePayload: null as unknown,
  updateFilters: [] as Array<[string, unknown]>,
  updated: { id: "link-1" } as unknown,
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "memberships") {
        const chain = {
          select: () => chain,
          eq: (c: string, v: unknown) => {
            mocks.memberFilters.push([c, v]);
            return c === "role" ? Promise.resolve({ data: mocks.memberships, error: null }) : chain;
          },
        };
        return chain;
      }
      const chain: Record<string, unknown> = {
        update: (p: unknown) => ((mocks.updatePayload = p), chain),
        eq: (c: string, v: unknown) => (mocks.updateFilters.push([c, v]), chain),
        in: (c: string, v: unknown) => (mocks.updateFilters.push([c, v]), chain),
        select: () => chain,
        maybeSingle: async () => ({ data: mocks.updated, error: null }),
      };
      return chain;
    },
  }),
}));

import { PATCH } from "@/app/api/accountant/link/route";

const LINK = "55555555-5555-4555-8555-555555555555";
const patch = (body: unknown) =>
  PATCH(
    new NextRequest("https://app.unreceipt.com/api/accountant/link", {
      method: "PATCH",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.user = { id: "u-owner" };
  mocks.memberFilters = [];
  mocks.memberships = [{ organization_id: "org-1" }];
  mocks.updatePayload = null;
  mocks.updateFilters = [];
  mocks.updated = { id: "link-1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/accountant/link (weekly reminders)", () => {
  it("lets an owner turn the firm's weekly reminder off for the company, on its own active link", async () => {
    const res = await patch({ linkId: LINK, weeklyReminders: false });
    expect(res.status).toBe(200);
    expect(mocks.memberFilters).toEqual([
      ["user_id", "u-owner"],
      ["role", "owner"],
    ]);
    expect(mocks.updatePayload).toEqual({ reminders_opted_out_at: expect.any(String) });
    expect(mocks.updateFilters).toEqual([
      ["id", LINK],
      ["organization_id", ["org-1"]],
      ["status", "active"],
    ]);
    await patch({ linkId: LINK, weeklyReminders: true });
    expect(mocks.updatePayload).toEqual({ reminders_opted_out_at: null });
  });

  it("refuses someone who isn't an owner, another company's link, or no session", async () => {
    mocks.memberships = [];
    expect((await patch({ linkId: LINK, weeklyReminders: false })).status).toBe(404);
    mocks.memberships = [{ organization_id: "org-1" }];
    mocks.updated = null;
    expect((await patch({ linkId: LINK, weeklyReminders: false })).status).toBe(404);
    mocks.user = null;
    expect((await patch({ linkId: LINK, weeklyReminders: false })).status).toBe(401);
    expect((await patch({ linkId: "nope", weeklyReminders: false })).status).toBe(401);
  });
});
