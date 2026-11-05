// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireFirmMember: vi.fn(),
  count: { count: 0 as number | null, error: null as unknown },
  insert: vi.fn(),
  del: vi.fn(),
  filters: [] as [string, unknown][],
}));

vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: mocks.requireFirmMember,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: async () => mocks.count }),
      insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
      delete: () => {
        const chain = {
          eq: (c: string, v: unknown) => {
            mocks.filters.push([c, v]);
            return chain;
          },
          select: () => ({ maybeSingle: () => mocks.del() }),
        };
        return chain;
      },
    }),
  }),
}));

import { FirmAuthError } from "@/lib/require-firm";
import { POST } from "@/app/api/firm/members/route";
import { DELETE } from "@/app/api/firm/members/[id]/route";

const ADMIN = { user: { id: "u-admin" }, memberId: "fm-admin", firmId: "firm-1", firmName: "Byrån", role: "admin" };
const OTHER = "55555555-5555-4555-8555-555555555555";

const post = (body: unknown) =>
  POST(new NextRequest("https://app.unreceipt.com/api/firm/members", {
    method: "POST",
    headers: { "content-type": "application/json", host: "app.unreceipt.com" },
    body: JSON.stringify(body),
  }));
const del = (id: string) =>
  DELETE(new NextRequest(`https://app.unreceipt.com/api/firm/members/${id}`, { method: "DELETE", headers: { host: "app.unreceipt.com" } }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  mocks.requireFirmMember.mockReset().mockResolvedValue(ADMIN);
  mocks.count = { count: 1, error: null };
  mocks.insert.mockReset().mockResolvedValue({ data: { id: "fm-new" }, error: null });
  mocks.del.mockReset().mockResolvedValue({ data: { id: OTHER }, error: null });
  mocks.filters = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/firm/members", () => {
  it("is admin-only", async () => {
    mocks.requireFirmMember.mockResolvedValue({ ...ADMIN, role: "staff" });
    expect((await post({ email: "x@y.se" })).status).toBe(403);
    mocks.requireFirmMember.mockRejectedValue(new FirmAuthError("no_user"));
    expect((await post({ email: "x@y.se" })).status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("adds a lowercased colleague to the session firm", async () => {
    const res = await post({ email: "Per@Byran.se", role: "admin" });
    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith({ firm_id: "firm-1", email: "per@byran.se", role: "admin", invited_by: "u-admin" });
  });

  it("explains duplicates and the cap", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await post({ email: "per@byran.se" })).status).toBe(409);
    mocks.count = { count: 50, error: null };
    expect((await post({ email: "new@byran.se" })).status).toBe(400);
  });
});

describe("DELETE /api/firm/members/[id]", () => {
  it("removes a colleague of the session firm", async () => {
    expect((await del(OTHER)).status).toBe(200);
    expect(mocks.filters).toEqual([["id", OTHER], ["firm_id", "firm-1"]]);
  });

  it("refuses self-removal, non-admins and unknown rows", async () => {
    expect((await del("fm-admin")).status).toBe(404); // not a uuid
    mocks.requireFirmMember.mockResolvedValue({ ...ADMIN, memberId: OTHER });
    expect((await del(OTHER)).status).toBe(400);
    mocks.requireFirmMember.mockResolvedValue({ ...ADMIN, role: "staff" });
    expect((await del(OTHER)).status).toBe(403);
    mocks.requireFirmMember.mockResolvedValue(ADMIN);
    mocks.del.mockResolvedValue({ data: null, error: null });
    expect((await del(OTHER)).status).toBe(404);
  });
});
