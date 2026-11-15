// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/lib/firm/__tests__/fake-db";

const mocks = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  users: {} as Record<string, { email: string; email_confirmed_at: string | null }>,
  usage: vi.fn(),
  approverMail: vi.fn(),
  decisionMail: vi.fn(),
  inviteMail: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    ...(mocks.db.client as object),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: mocks.users[id] ? { id, ...mocks.users[id] } : null }, error: null }),
      },
    },
  }),
}));
vi.mock("@/lib/usage", () => ({ recordReceiptUsage: mocks.usage, usageSource: () => "paper" }));
vi.mock("@/lib/team/emails", () => ({
  notifyApprovers: mocks.approverMail,
  notifyDecision: mocks.decisionMail,
  sendTeamInvite: mocks.inviteMail,
}));
vi.mock("@/lib/organizations", () => ({
  getOrCreateDefaultOrganization: async (userId: string) =>
    (mocks.db.tables.organizations ?? []).find((o) => o.default_for_user_id === userId)?.id ?? null,
  getDefaultOrganizationId: async (userId: string) =>
    (mocks.db.tables.organizations ?? []).find((o) => o.default_for_user_id === userId)?.id ?? null,
}));

import { decideReceipt, loadReimbursements, markReimbursed, submitReceipt } from "../decisions";
import { acceptTeamInvite, createTeamInvite } from "../invites";
import { isFirmVisible } from "@/lib/firm/visibility";

const BOSS = "b0000000-0000-4000-8000-000000000001";
const ANNA = "a0000000-0000-4000-8000-000000000002";
const MALLORY = "c0000000-0000-4000-8000-000000000003";
const ORG = "org-acme";
const user = (id: string) => ({ id, ...mocks.users[id] }) as never;

const receipt = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  user_id: ANNA,
  organization_id: ORG,
  merchant_name: "Pressbyrån",
  total: 49,
  currency: "SEK",
  receipt_date: "2026-11-14",
  purchased_at: "2026-11-14T12:00:00Z",
  status: "pending_review",
  source: "paper",
  approval_status: "draft",
  ...over,
});

const r1 = () => mocks.db.tables.receipts.find((r) => r.id === "r1")!;

beforeEach(() => {
  mocks.users = {
    [BOSS]: { email: "boss@acme.se", email_confirmed_at: "2026-10-01" },
    [ANNA]: { email: "Anna.Svensson@gmail.com", email_confirmed_at: "2026-10-01" },
    [MALLORY]: { email: "mallory@evil.test", email_confirmed_at: "2026-10-01" },
  };
  mocks.db = createFakeDb({
    organizations: [{ id: ORG, name: "Acme AB", default_for_user_id: BOSS }],
    memberships: [
      { organization_id: ORG, user_id: BOSS, role: "owner", approver_id: null, created_at: "2026-10-01" },
      { organization_id: ORG, user_id: ANNA, role: "member", approver_id: null, created_at: "2026-11-01" },
    ],
    receipts: [receipt()],
    team_invites: [],
    receipt_approvals: [],
  });
  for (const m of [mocks.usage, mocks.approverMail, mocks.decisionMail, mocks.inviteMail]) m.mockReset();
  mocks.inviteMail.mockResolvedValue(true);
});

describe("send, then decide", () => {
  it("the employee sends a checked receipt; it counts and the owner hears about it", async () => {
    const res = await submitReceipt(ANNA, "r1", "employee");
    expect(res).toEqual({ ok: true, value: { approvedBy: "boss@acme.se" } });
    expect(r1()).toMatchObject({ approval_status: "submitted", status: "verified", paid_by: "employee" });
    expect(mocks.usage).toHaveBeenCalledWith(expect.objectContaining({ userId: ANNA, receiptId: "r1" }));
    expect(mocks.approverMail).toHaveBeenCalledWith(expect.objectContaining({ approvers: [BOSS] }));
    expect(mocks.db.tables.receipt_approvals.map((a) => a.action)).toEqual(["submitted"]);
    // Not for the accountant yet.
    expect(isFirmVisible(r1() as never)).toBe(false);
  });

  it("refuses an incomplete receipt and someone else's", async () => {
    r1().total = null;
    expect(await submitReceipt(ANNA, "r1", "employee")).toMatchObject({ ok: false, error: "incomplete" });
    expect(await submitReceipt(BOSS, "r1", "employee")).toMatchObject({ ok: false, status: 404 });
  });

  it("the owner approves; the accountant now sees it and it is owed to Anna", async () => {
    await submitReceipt(ANNA, "r1", "employee");
    expect(await decideReceipt(BOSS, "r1", "approve", null)).toEqual({ ok: true, value: null });
    expect(r1()).toMatchObject({ approval_status: "approved", decided_by: BOSS });
    expect(isFirmVisible(r1() as never)).toBe(true);
    const owed = await loadReimbursements(BOSS);
    expect(owed).toMatchObject({ ok: true, value: [{ userId: ANNA, total: 49, currency: "SEK", count: 1 }] });
    expect(await markReimbursed(BOSS, ["r1"])).toEqual({ ok: true, value: { count: 1 } });
    expect(r1().reimbursed_at).toBeTruthy();
  });

  it("decides once: a second answer finds it already decided", async () => {
    await submitReceipt(ANNA, "r1", "employee");
    await decideReceipt(BOSS, "r1", "approve", null);
    expect(await decideReceipt(BOSS, "r1", "reject", "No")).toMatchObject({ ok: false, status: 409 });
  });

  it("sending back needs a reason, and tells the employee", async () => {
    await submitReceipt(ANNA, "r1", "employee");
    expect(await decideReceipt(BOSS, "r1", "send_back", " ")).toMatchObject({ ok: false, error: "comment_required" });
    expect(await decideReceipt(BOSS, "r1", "send_back", "Add who was at the lunch")).toMatchObject({ ok: true });
    expect(r1()).toMatchObject({ approval_status: "sent_back", approval_comment: "Add who was at the lunch" });
    expect(mocks.decisionMail).toHaveBeenCalledWith(expect.objectContaining({ employeeId: ANNA, decision: "sent_back" }));
    // Fixed and sent again.
    expect(await submitReceipt(ANNA, "r1", "employee")).toMatchObject({ ok: true });
  });

  it("nobody approves their own receipt, and a stranger can't even see it", async () => {
    await submitReceipt(ANNA, "r1", "employee");
    expect(await decideReceipt(ANNA, "r1", "approve", null)).toMatchObject({ ok: false, status: 404 });
    expect(await decideReceipt(MALLORY, "r1", "approve", null)).toMatchObject({ ok: false, status: 404 });
    expect(r1().approval_status).toBe("submitted");
  });

  it("a draft can't be decided on before the employee sends it", async () => {
    expect(await decideReceipt(BOSS, "r1", "approve", null)).toMatchObject({ ok: false, status: 404 });
  });

  it("only the owner sees and pays back outlays", async () => {
    expect(await loadReimbursements(ANNA)).toMatchObject({ ok: false, status: 403 });
    expect(await markReimbursed(ANNA, ["r1"])).toMatchObject({ ok: false, status: 403 });
  });
});

describe("joining a team", () => {
  it("the owner invites; only the invited, confirmed address can join", async () => {
    mocks.db.tables.memberships = mocks.db.tables.memberships.filter((m) => m.user_id !== ANNA);
    const res = await createTeamInvite(user(BOSS), { email: "anna.svensson+work@gmail.com", role: "member", approverId: null });
    expect(res).toEqual({ ok: true, emailed: true });
    const invite = mocks.db.tables.team_invites[0];
    expect(invite).toMatchObject({ organization_id: ORG, email: "annasvensson@gmail.com", role: "member" });

    // Someone else who learnt the invite id: a miss.
    expect(await acceptTeamInvite(user(MALLORY), invite.id as string)).toMatchObject({ ok: false, status: 404 });
    // An unconfirmed address: refused.
    mocks.users[ANNA].email_confirmed_at = null;
    expect(await acceptTeamInvite(user(ANNA), invite.id as string)).toMatchObject({ ok: false, status: 403 });
    mocks.users[ANNA].email_confirmed_at = "2026-10-01";

    expect(await acceptTeamInvite(user(ANNA), invite.id as string)).toMatchObject({ ok: true });
    expect(mocks.db.tables.memberships).toContainEqual(
      expect.objectContaining({ organization_id: ORG, user_id: ANNA, role: "member" })
    );
    expect(invite.accepted_at).toBeTruthy();
  });

  it("an employee can't invite, and an owner can't invite their own address", async () => {
    expect(await createTeamInvite(user(ANNA), { email: "x@acme.se", role: "member", approverId: null })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await createTeamInvite(user(BOSS), { email: "Boss@acme.se", role: "member", approverId: null })).toMatchObject({
      ok: false,
      error: "own_address",
    });
  });

  it("someone already in another company's team can't join a second one", async () => {
    mocks.db.tables.organizations.push({ id: "org-other", name: "Other AB", default_for_user_id: MALLORY });
    mocks.db.tables.team_invites.push({ id: "inv-2", organization_id: "org-other", email: "annasvensson@gmail.com", role: "member", approver_id: null, accepted_at: null });
    expect(await acceptTeamInvite(user(ANNA), "inv-2")).toMatchObject({ ok: false, error: "already_in_a_team" });
  });
});
