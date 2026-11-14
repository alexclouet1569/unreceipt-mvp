// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashInviteToken } from "@/lib/firm/invites";
import { createFakeDb, type FakeDb } from "@/lib/firm/__tests__/fake-db";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
  db: null as unknown as FakeDb,
  org: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/firm/link-emails", () => ({ sendLinkConfirmation: mocks.confirm }));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/organizations", () => ({ getOrCreateDefaultOrganization: mocks.org }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => mocks.db.client }));

import { POST } from "@/app/api/accountant/respond/route";
import { DELETE } from "@/app/api/accountant/link/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "Anna@Acme.se", email_confirmed_at: "2026-10-01T00:00:00Z" };
const INVITE_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ID = "66666666-6666-4666-8666-666666666666";
const TOKEN = "A".repeat(32);
const future = () => new Date(Date.now() + 86400000).toISOString();
const openInvite = (over: Record<string, unknown> = {}) => ({
  id: INVITE_ID,
  firm_id: "firm-1",
  organization_id: null,
  direction: "firm",
  status: "invited",
  invited_email: "anna@acme.se",
  invite_token_hash: hashInviteToken(TOKEN),
  invite_expires_at: future(),
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

const link = (id = INVITE_ID) => mocks.db.tables.firm_clients.find((r) => r.id === id)!;
const writes = (table: string, op: string) => mocks.db.log.filter((l) => l.table === table && l.op === op);

beforeEach(() => {
  mocks.user = USER;
  mocks.db = createFakeDb({
    firm_clients: [openInvite()],
    memberships: [{ organization_id: "org-1", user_id: USER.id, role: "owner" }],
    bank_transactions: [{ id: "b1", organization_id: "org-1" }],
    client_reminders: [{ id: "cr1", organization_id: "org-1" }],
  });
  // One active firm per company (firm_clients_active_org_unique).
  mocks.db.guard = (table, op, rows, payload) => {
    if (table !== "firm_clients" || op !== "update") return null;
    const p = payload as Record<string, unknown>;
    if (p.status !== "active") return null;
    const org = (p.organization_id ?? rows[0]?.organization_id) as string | undefined;
    const clash = mocks.db.tables.firm_clients.some(
      (r) => r.status === "active" && r.organization_id === org && !rows.includes(r)
    );
    return clash ? { code: "23505" } : null;
  };
  mocks.org.mockReset().mockResolvedValue("org-1");
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
    expect(writes("firm_clients", "update")).toEqual([]);
  });

  it("accepts for the invited, confirmed address: links the caller's default organisation", async () => {
    const res = await respond({ inviteId: INVITE_ID, action: "accept", token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "active" });
    expect(mocks.org).toHaveBeenCalledWith(USER.id);
    expect(link()).toMatchObject({
      status: "active",
      organization_id: "org-1",
      accepted_by: USER.id,
      invite_token_hash: null,
    });
    expect(mocks.confirm).toHaveBeenCalledWith({ clientUserId: USER.id, firmId: "firm-1" });
  });

  it("matches an invite stored normalised for a dotted Gmail or googlemail.com sign-in", async () => {
    for (const email of ["Anna.Berg+kvitton@Gmail.com", "anna.berg@googlemail.com"]) {
      mocks.db.tables.firm_clients = [openInvite({ invited_email: "annaberg@gmail.com" })];
      mocks.user = { ...USER, email };
      const res = await respond({ inviteId: INVITE_ID, action: "accept" });
      expect(res.status).toBe(200);
      expect(link().status).toBe("active");
    }
  });

  it("withdraws the company's waiting request to another accountant once linked", async () => {
    mocks.db.tables.firm_clients.push({
      id: OTHER_ID,
      firm_id: null,
      organization_id: "org-1",
      direction: "client",
      status: "invited",
      invited_email: "other@byra.se",
      invite_token_hash: "h",
    });
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(200);
    expect(link(OTHER_ID)).toMatchObject({ status: "revoked", invite_token_hash: null });
  });

  it("ignores a client-sent invite (that one is answered by the accountant)", async () => {
    mocks.db.tables.firm_clients = [openInvite({ direction: "client" })];
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
    expect(writes("firm_clients", "update")).toEqual([]);
  });

  it("refuses an expired invite by email match too", async () => {
    mocks.db.tables.firm_clients = [openInvite({ invite_expires_at: "2020-01-01T00:00:00Z" })];
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(404);
  });

  it("refuses an expired token even for the right link", async () => {
    mocks.user = { ...USER, email: "other@x.se" };
    mocks.db.tables.firm_clients = [openInvite({ invite_expires_at: "2020-01-01T00:00:00Z" })];
    expect((await respond({ inviteId: INVITE_ID, action: "accept", token: TOKEN })).status).toBe(404);
  });

  it("answers 404 for an invite that is no longer open", async () => {
    mocks.db.tables.firm_clients = [openInvite({ status: "active" })];
    expect((await respond({ inviteId: INVITE_ID, action: "accept" })).status).toBe(404);
  });

  it("declines by revoking", async () => {
    const res = await respond({ inviteId: INVITE_ID, action: "decline" });
    expect(await res.json()).toEqual({ ok: true, status: "revoked" });
    expect(link()).toMatchObject({ status: "revoked", invite_token_hash: null });
    expect(mocks.org).not.toHaveBeenCalled();
  });

  it("explains a second firm (unique violation) as 409 and withdraws nothing", async () => {
    mocks.db.tables.firm_clients.push(
      { id: "active-elsewhere", firm_id: "firm-2", organization_id: "org-1", direction: "firm", status: "active" },
      { id: OTHER_ID, firm_id: null, organization_id: "org-1", direction: "client", status: "invited" }
    );
    const res = await respond({ inviteId: INVITE_ID, action: "accept" });
    expect(res.status).toBe(409);
    expect(link(OTHER_ID).status).toBe("invited");
  });
});

describe("DELETE /api/accountant/link", () => {
  it("stops an active link and ends the firm's bank check and reminder log", async () => {
    mocks.db.tables.firm_clients = [openInvite({ status: "active", organization_id: "org-1" })];
    const res = await unlink({ linkId: INVITE_ID });
    expect(res.status).toBe(200);
    expect(link()).toMatchObject({ status: "revoked" });
    expect(mocks.db.tables.bank_transactions).toEqual([]);
    expect(mocks.db.tables.client_reminders).toEqual([]);
  });

  it("withdrawing an old request leaves the connected firm's bank work alone", async () => {
    mocks.db.tables.firm_clients = [
      { id: "active-link", firm_id: "firm-2", organization_id: "org-1", direction: "firm", status: "active" },
      openInvite({ direction: "client", firm_id: null, organization_id: "org-1" }),
    ];
    const res = await unlink({ linkId: INVITE_ID });
    expect(res.status).toBe(200);
    expect(link()).toMatchObject({ status: "revoked" });
    expect(link("active-link").status).toBe("active");
    expect(mocks.db.tables.bank_transactions).toHaveLength(1);
    expect(mocks.db.tables.client_reminders).toHaveLength(1);
    expect(writes("bank_transactions", "delete")).toEqual([]);
  });

  it("answers 404 without a membership, for another company's link, or a firm-sent invite", async () => {
    mocks.db.tables.memberships = [];
    expect((await unlink({ linkId: INVITE_ID })).status).toBe(404);
    mocks.db.tables.memberships = [{ organization_id: "org-1", user_id: USER.id, role: "owner" }];
    mocks.db.tables.firm_clients = [openInvite({ status: "active", organization_id: "org-2" })];
    expect((await unlink({ linkId: INVITE_ID })).status).toBe(404);
    mocks.db.tables.firm_clients = [openInvite({ organization_id: "org-1" })];
    expect((await unlink({ linkId: INVITE_ID })).status).toBe(404);
    expect(writes("firm_clients", "update")).toEqual([]);
    expect(mocks.db.tables.bank_transactions).toHaveLength(1);
  });
});
