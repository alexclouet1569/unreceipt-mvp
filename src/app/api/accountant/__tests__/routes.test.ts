// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashInviteToken } from "@/lib/firm/invites";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
  invite: { data: null as unknown, error: null as unknown },
  memberships: { data: [] as unknown[], error: null as unknown },
  update: vi.fn(),
  org: vi.fn(),
  filters: [] as [string, unknown][],
  confirm: vi.fn(),
}));

vi.mock("@/lib/firm/link-emails", () => ({ sendLinkConfirmation: mocks.confirm }));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/organizations", () => ({ getOrCreateDefaultOrganization: mocks.org }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => mocks.invite,
          then: (r: (v: unknown) => void) => r(table === "memberships" ? mocks.memberships : mocks.invite),
        };
        return chain;
      },
      update: (row: unknown) => {
        const chain = {
          eq: (c: string, v: unknown) => {
            mocks.filters.push([c, v]);
            return chain;
          },
          in: (c: string, v: unknown) => {
            mocks.filters.push([c, v]);
            return chain;
          },
          or: (v: unknown) => {
            mocks.filters.push(["or", v]);
            return chain;
          },
          select: () => ({ maybeSingle: () => mocks.update(row) }),
          then: (r: (v: unknown) => void) => r(mocks.update(row)),
        };
        return chain;
      },
    }),
  }),
}));

import { POST } from "@/app/api/accountant/respond/route";
import { DELETE } from "@/app/api/accountant/link/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "Anna@Acme.se", email_confirmed_at: "2026-10-01T00:00:00Z" };
const INVITE_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "A".repeat(32);
const openInvite = (over: Record<string, unknown> = {}) => ({
  id: INVITE_ID,
  firm_id: "firm-1",
  direction: "firm",
  status: "invited",
  invited_email: "anna@acme.se",
  invite_token_hash: hashInviteToken(TOKEN),
  invite_expires_at: new Date(Date.now() + 86400000).toISOString(),
  ...over,
});

const respond = (body: unknown) =>
  POST(
    new NextRequest("https://app.unreceipt.com/api/accountant/respond", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    })
  );
const unlink = (body: unknown) =>
  DELETE(
    new NextRequest("https://app.unreceipt.com/api/accountant/link", {
      method: "DELETE",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.user = USER;
  mocks.invite = { data: openInvite(), error: null };
  mocks.memberships = { data: [{ organization_id: "org-1" }], error: null };
  mocks.update.mockReset().mockResolvedValue({ data: { id: INVITE_ID }, error: null });
  mocks.org.mockReset().mockResolvedValue("org-1");
  mocks.filters = [];
  mocks.confirm.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/accountant/respond", () => {
  it("needs a signed-in user and a well-formed body", async () => {
    mocks.user = null;
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(401);
    mocks.user = USER;
    expect((await respond({ inviteId: "x", action: "accept" })).status).toBe(400);
    expect((await respond({ inviteId: INVITE_ID, action: "maybe" })).status).toBe(400);
  });

  it("refuses the link token from another account (two locks: link + invited address)", async () => {
    mocks.user = { ...USER, email: "someone-else@example.com" };
    const res = await respond({ inviteId: INVITE_ID, action: "accept", token: TOKEN });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "wrong_account" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("accepts for the invited, confirmed address: links the caller's default organisation", async () => {
    const res = await respond({ inviteId: INVITE_ID, action: "accept", token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "active" });
    expect(mocks.org).toHaveBeenCalledWith(USER.id);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      status: "active",
      organization_id: "org-1",
      accepted_by: USER.id,
      invite_token_hash: null,
    });
    expect(mocks.filters).toEqual([["id", INVITE_ID], ["status", "invited"]]);
    expect(mocks.confirm).toHaveBeenCalledWith({ clientUserId: USER.id, firmId: "firm-1" });
  });

  it("ignores a client-sent invite (that one is answered by the accountant)", async () => {
    mocks.invite = { data: openInvite({ direction: "client" }), error: null };
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(404);
  });

  it("accepts without a token when signed in with the invited, confirmed address", async () => {
    const res = await respond({ inviteId: INVITE_ID, action: "accept" });
    expect(res.status).toBe(200);
  });

  it("refuses an unconfirmed address and another account", async () => {
    mocks.user = { ...USER, email_confirmed_at: null };
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(403);
    mocks.user = { ...USER, email: "other@x.se" };
    expect((await respond({ inviteId: INVITE_ID, action: "accept", token: "B".repeat(32) })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses an expired invite by email match too", async () => {
    mocks.invite = { data: openInvite({ invite_expires_at: "2020-01-01T00:00:00Z" }), error: null };
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(404);
  });

  it("refuses an expired token even for the right link", async () => {
    mocks.user = { ...USER, email: "other@x.se" };
    mocks.invite = { data: openInvite({ invite_expires_at: "2020-01-01T00:00:00Z" }), error: null };
    expect((await respond({ inviteId: INVITE_ID, action: "accept", token: TOKEN })).status).toBe(404);
  });

  it("answers 404 for an invite that is no longer open", async () => {
    mocks.invite = { data: openInvite({ status: "active" }), error: null };
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(404);
  });

  it("declines by revoking", async () => {
    const res = await respond({ inviteId: INVITE_ID, action: "decline" });
    expect(await res.json()).toEqual({ ok: true, status: "revoked" });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ status: "revoked", invite_token_hash: null });
    expect(mocks.org).not.toHaveBeenCalled();
  });

  it("explains a second firm (unique violation) as 409", async () => {
    mocks.update.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
    const res = await respond({ inviteId: INVITE_ID, action: "accept" });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/accountant/link", () => {
  it("revokes an active link, or a waiting client-sent invite, of the caller's organisations", async () => {
    const res = await unlink({ linkId: INVITE_ID });
    expect(res.status).toBe(200);
    expect(mocks.filters).toEqual([
      ["id", INVITE_ID],
      ["organization_id", ["org-1"]],
      ["or", "status.eq.active,and(status.eq.invited,direction.eq.client)"],
    ]);
  });

  it("answers 404 without a membership or for another company's link", async () => {
    mocks.memberships = { data: [], error: null };
    expect((await unlink({ linkId: INVITE_ID })).status).toBe(404);
    mocks.memberships = { data: [{ organization_id: "org-1" }], error: null };
    mocks.update.mockResolvedValue({ data: null, error: null });
    expect((await unlink({ linkId: INVITE_ID })).status).toBe(404);
  });
});
