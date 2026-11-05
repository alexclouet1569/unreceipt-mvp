// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
  row: { data: null as unknown, error: null as unknown },
  membership: null as null | { firmId: string; firmName: string },
  update: vi.fn(),
  inserts: [] as [string, unknown][],
  firmInsert: { data: { id: "new-firm" } as unknown, error: null as unknown },
  memberInsert: { error: null as unknown },
  confirm: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/firm/link-emails", () => ({ sendLinkConfirmation: mocks.confirm }));
vi.mock("@/lib/require-firm", () => ({
  isUuid: (v: string) => /^[0-9a-f-]{36}$/.test(v),
  resolveFirmMembership: async () => mocks.membership,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = { eq: () => chain, maybeSingle: async () => mocks.row };
        return chain;
      },
      insert: (row: unknown) => {
        mocks.inserts.push([table, row]);
        if (table === "firms") return { select: () => ({ single: async () => mocks.firmInsert }) };
        return Promise.resolve(mocks.memberInsert);
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
      update: (row: unknown) => {
        const chain = {
          eq: () => chain,
          select: () => ({ maybeSingle: () => mocks.update(row) }),
          then: (r: (v: unknown) => void) => r(mocks.update(row)),
        };
        return chain;
      },
    }),
  }),
}));

import { POST } from "@/app/api/firm-request/respond/route";

const ACCOUNTANT = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "Erik@Byra.se", email_confirmed_at: "2026-10-01T00:00:00Z" };
const ID = "44444444-4444-4444-8444-444444444444";
const openRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  organization_id: "org-1",
  status: "invited",
  direction: "client",
  invited_email: "erik@byra.se",
  invite_expires_at: new Date(Date.now() + 86400000).toISOString(),
  invited_by: "client-user",
  ...over,
});
const call = (body: unknown) =>
  POST(
    new NextRequest("https://app.unreceipt.com/api/firm-request/respond", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.user = ACCOUNTANT;
  mocks.row = { data: openRow(), error: null };
  mocks.membership = { firmId: "firm-1", firmName: "Byrån" };
  mocks.update.mockReset().mockResolvedValue({ data: { id: ID }, error: null });
  mocks.inserts = [];
  mocks.firmInsert = { data: { id: "new-firm" }, error: null };
  mocks.memberInsert = { error: null };
  mocks.confirm.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/firm-request/respond", () => {
  it("needs a signed-in user", async () => {
    mocks.user = null;
    expect((await call({ inviteId: ID, action: "accept" })).status).toBe(401);
  });

  it("only the invited, confirmed address may answer", async () => {
    mocks.user = { ...ACCOUNTANT, email: "someone@else.se" };
    expect((await call({ inviteId: ID, action: "accept" })).status).toBe(403);
    mocks.user = { ...ACCOUNTANT, email_confirmed_at: null };
    expect((await call({ inviteId: ID, action: "accept" })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("ignores firm-sent, used and expired invites", async () => {
    for (const over of [{ direction: "firm" }, { status: "active" }, { invite_expires_at: "2020-01-01T00:00:00Z" }]) {
      mocks.row = { data: openRow(over), error: null };
      expect((await call({ inviteId: ID, action: "accept" })).status).toBe(404);
    }
  });

  it("a firm member accepts into their own firm and the client is told", async () => {
    const res = await call({ inviteId: ID, action: "accept" });
    expect(res.status).toBe(200);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ firm_id: "firm-1", status: "active", invite_token_hash: null });
    expect(mocks.inserts).toEqual([]);
    expect(mocks.confirm).toHaveBeenCalledWith({ clientUserId: "client-user", firmId: "firm-1" });
  });

  it("an accountant without a firm must name it, then the firm and its admin are created", async () => {
    mocks.membership = null;
    const missing = await call({ inviteId: ID, action: "accept" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "firm_name_required" });

    const res = await call({ inviteId: ID, action: "accept", firmName: "Byrån AB" });
    expect(res.status).toBe(200);
    expect(mocks.inserts[0]).toEqual(["firms", { name: "Byrån AB", country: "SE" }]);
    expect(mocks.inserts[1][0]).toBe("firm_members");
    expect(mocks.inserts[1][1]).toMatchObject({ firm_id: "new-firm", user_id: ACCOUNTANT.id, email: "erik@byra.se", role: "admin" });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ firm_id: "new-firm", status: "active" });
  });

  it("refuses a firm name that would look official in the emails it sends", async () => {
    mocks.membership = null;
    const res = await call({ inviteId: ID, action: "accept", firmName: "Skatteverket" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "firm_name_invalid" });
    expect(mocks.inserts).toEqual([]);
  });

  it("declines by revoking, without creating anything", async () => {
    mocks.membership = null;
    const res = await call({ inviteId: ID, action: "decline" });
    expect(await res.json()).toEqual({ ok: true, status: "revoked" });
    expect(mocks.inserts).toEqual([]);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("explains a company already connected elsewhere as 409", async () => {
    mocks.update.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await call({ inviteId: ID, action: "accept" })).status).toBe(409);
  });
});
