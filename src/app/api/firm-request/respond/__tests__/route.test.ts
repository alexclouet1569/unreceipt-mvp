// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeDb, type FakeDb } from "@/lib/firm/__tests__/fake-db";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
  db: null as unknown as FakeDb,
  membership: null as null | { firmId: string; firmName: string },
  pendingSeat: null as null | { firmName: string },
  confirm: vi.fn(),
  claimed: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/firm/link-emails", () => ({ sendLinkConfirmation: mocks.confirm }));
vi.mock("@/lib/require-firm", () => ({
  isUuid: (v: string) => /^[0-9a-f-]{36}$/.test(v),
  getFirmMembership: async () => mocks.membership,
  findPendingFirmSeat: async () => mocks.pendingSeat,
  // Must never be used here: answering a request never claims a seat.
  claimPendingFirmSeat: mocks.claimed,
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => mocks.db.client }));

import { POST } from "@/app/api/firm-request/respond/route";

const ACCOUNTANT = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "Erik@Byra.se", email_confirmed_at: "2026-10-01T00:00:00Z" };
const ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ID = "66666666-6666-4666-8666-666666666666";
const openRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  firm_id: null,
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
const row = (id = ID) => mocks.db.tables.firm_clients.find((r) => r.id === id)!;
const updates = () => mocks.db.log.filter((l) => l.table === "firm_clients" && l.op === "update");

beforeEach(() => {
  mocks.user = ACCOUNTANT;
  mocks.db = createFakeDb({
    firm_clients: [openRow()],
    firms: [],
    firm_members: [],
    organizations: [{ id: "org-1", country: "SE" }],
  });
  mocks.membership = { firmId: "firm-1", firmName: "Byrån" };
  mocks.pendingSeat = null;
  mocks.confirm.mockReset().mockResolvedValue(undefined);
  mocks.claimed.mockReset();
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
    expect(updates()).toEqual([]);
  });

  it("matches a request stored normalised for a dotted Gmail or googlemail.com sign-in", async () => {
    for (const email of ["Erik.Lund+byra@gmail.com", "erik.lund@googlemail.com"]) {
      mocks.db.tables.firm_clients = [openRow({ invited_email: "eriklund@gmail.com" })];
      mocks.user = { ...ACCOUNTANT, email };
      expect((await call({ inviteId: ID, action: "accept" })).status).toBe(200);
      expect(row().status).toBe("active");
    }
  });

  it("ignores firm-sent, used and expired invites", async () => {
    for (const over of [{ direction: "firm" }, { status: "active" }, { invite_expires_at: "2020-01-01T00:00:00Z" }]) {
      mocks.db.tables.firm_clients = [openRow(over)];
      expect((await call({ inviteId: ID, action: "accept" })).status).toBe(404);
    }
  });

  it("a firm member accepts into their own firm and the client is told", async () => {
    const res = await call({ inviteId: ID, action: "accept" });
    expect(res.status).toBe(200);
    expect(row()).toMatchObject({ firm_id: "firm-1", status: "active", invite_token_hash: null });
    expect(mocks.db.tables.firms).toEqual([]);
    expect(mocks.confirm).toHaveBeenCalledWith({ clientUserId: "client-user", firmId: "firm-1" });
  });

  it("withdraws the company's other waiting requests once linked", async () => {
    mocks.db.tables.firm_clients.push(openRow({ id: OTHER_ID, invited_email: "other@byra.se" }));
    expect((await call({ inviteId: ID, action: "accept" })).status).toBe(200);
    expect(row(OTHER_ID)).toMatchObject({ status: "revoked", invite_token_hash: null });
  });

  it("an accountant without a firm must name it, then the firm (client's country) and its admin are created", async () => {
    mocks.membership = null;
    mocks.db.tables.organizations = [{ id: "org-1", country: "FR" }];
    mocks.user = { ...ACCOUNTANT, email: "Erik.Lund@Googlemail.com" };
    mocks.db.tables.firm_clients = [openRow({ invited_email: "eriklund@gmail.com" })];
    const missing = await call({ inviteId: ID, action: "accept" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "firm_name_required" });

    const res = await call({ inviteId: ID, action: "accept", firmName: "Cabinet Lund" });
    expect(res.status).toBe(200);
    expect(mocks.db.tables.firms).toEqual([expect.objectContaining({ name: "Cabinet Lund", country: "FR" })]);
    const firmId = mocks.db.tables.firms[0].id;
    expect(mocks.db.tables.firm_members).toEqual([
      // The seat's address is stored normalised, like every other seat.
      expect.objectContaining({ firm_id: firmId, user_id: ACCOUNTANT.id, email: "eriklund@gmail.com", role: "admin" }),
    ]);
    expect(row()).toMatchObject({ firm_id: firmId, status: "active" });
  });

  it("falls back to SE when the client's country can't be read", async () => {
    mocks.membership = null;
    mocks.db.tables.organizations = [];
    expect((await call({ inviteId: ID, action: "accept", firmName: "Byrån AB" })).status).toBe(200);
    expect(mocks.db.tables.firms[0]).toMatchObject({ country: "SE" });
  });

  it("never claims a pending firm seat: asks the accountant to join that firm first", async () => {
    mocks.membership = null;
    mocks.pendingSeat = { firmName: "Other Byrå" };
    const res = await call({ inviteId: ID, action: "accept", firmName: "Byrån AB" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "join_firm_first", firmName: "Other Byrå" });
    expect(mocks.claimed).not.toHaveBeenCalled();
    expect(mocks.db.tables.firms).toEqual([]);
    expect(row().status).toBe("invited");
  });

  it("refuses a firm name that would look official in the emails it sends", async () => {
    mocks.membership = null;
    const res = await call({ inviteId: ID, action: "accept", firmName: "Skatteverket" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "firm_name_invalid" });
    expect(mocks.db.tables.firms).toEqual([]);
  });

  it("declines by revoking, without creating anything", async () => {
    mocks.membership = null;
    const res = await call({ inviteId: ID, action: "decline" });
    expect(await res.json()).toEqual({ ok: true, status: "revoked" });
    expect(mocks.db.tables.firms).toEqual([]);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("refuses a company already connected elsewhere before creating a firm", async () => {
    mocks.membership = null;
    mocks.db.tables.firm_clients.push({ id: "active", firm_id: "firm-9", organization_id: "org-1", status: "active" });
    const res = await call({ inviteId: ID, action: "accept", firmName: "Byrån AB" });
    expect(res.status).toBe(409);
    expect(mocks.db.tables.firms).toEqual([]);
    expect(mocks.db.tables.firm_members).toEqual([]);
    expect(row().status).toBe("invited");
  });

  it("removes a firm it just created when the accept loses a race (23505)", async () => {
    mocks.membership = null;
    mocks.db.guard = (table, op, _rows, payload) =>
      table === "firm_clients" && op === "update" && (payload as { status?: string }).status === "active"
        ? { code: "23505" }
        : null;
    const res = await call({ inviteId: ID, action: "accept", firmName: "Byrån AB" });
    expect(res.status).toBe(409);
    expect(mocks.db.tables.firms).toEqual([]);
  });
});
