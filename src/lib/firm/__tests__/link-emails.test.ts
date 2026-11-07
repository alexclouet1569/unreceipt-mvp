// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  owners: [] as Array<{ user_id: string; organization_id: string }>,
  emails: {} as Record<string, string | null>,
  ownerError: null as null | { code: string },
  sendOk: true,
  sent: [] as Array<{ to: string; subject: string; tag: string }>,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/email/send", () => ({
  founderReplyTo: () => null,
  sendEmail: async (e: { to: string; subject: string; tag: string }) => {
    state.sent.push({ to: e.to, subject: e.subject, tag: e.tag });
    return state.sendOk ? { ok: true } : { ok: false, reason: "resend_error" };
  },
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      let orgIds: string[] = [];
      let role: string | null = null;
      const q = {
        select: () => q,
        in: (col: string, ids: string[]) => {
          state.filters.push([col, ids]);
          orgIds = ids;
          return q;
        },
        eq: (col: string, val: string) => {
          state.filters.push([col, val]);
          role = val;
          return Promise.resolve({
            data: state.ownerError
              ? null
              : state.owners.filter((o) => orgIds.includes(o.organization_id) && role === "owner"),
            error: state.ownerError,
          });
        },
      };
      return q;
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: state.emails[id] ? { email: state.emails[id] } : null },
        }),
      },
    },
  }),
}));

import { sendFirmClosedNotices } from "../link-emails";

beforeEach(() => {
  state.owners = [];
  state.emails = {};
  state.ownerError = null;
  state.sendOk = true;
  state.sent = [];
  state.filters = [];
});

describe("sendFirmClosedNotices", () => {
  it("emails each owner of each linked company once", async () => {
    state.owners = [
      { user_id: "u1", organization_id: "org-1" },
      { user_id: "u2", organization_id: "org-2" },
      // The same person owning two of the firm's clients gets one email.
      { user_id: "u1", organization_id: "org-2" },
      { user_id: "u-other", organization_id: "org-not-linked" },
    ];
    state.emails = { u1: "anna@ica-test.se", u2: "bo@example.se", "u-other": "x@example.se" };

    const result = await sendFirmClosedNotices({
      firmName: "Bokföring AB",
      organizationIds: ["org-1", "org-2"],
    });

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(state.sent).toEqual([
      { to: "anna@ica-test.se", subject: "Bokföring AB no longer sees your receipts", tag: "firm_closed" },
      { to: "bo@example.se", subject: "Bokföring AB no longer sees your receipts", tag: "firm_closed" },
    ]);
    expect(state.filters).toContainEqual(["role", "owner"]);
  });

  it("sends nothing for a firm without clients", async () => {
    expect(await sendFirmClosedNotices({ firmName: "X", organizationIds: [] })).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(state.filters).toEqual([]);
  });

  it("never throws: a lookup error or a failed send is only counted", async () => {
    state.ownerError = { code: "XX000" };
    await expect(
      sendFirmClosedNotices({ firmName: "X", organizationIds: ["org-1"] }),
    ).resolves.toEqual({ sent: 0, failed: 1 });

    state.ownerError = null;
    state.sendOk = false;
    state.owners = [{ user_id: "u1", organization_id: "org-1" }];
    state.emails = { u1: "anna@example.se" };
    await expect(
      sendFirmClosedNotices({ firmName: "X", organizationIds: ["org-1"] }),
    ).resolves.toEqual({ sent: 0, failed: 1 });
  });
});

describe("sendFirmClosedNotices budget", () => {
  it("stops starting sends once the time budget is spent and counts the rest as failed", async () => {
    state.owners = [
      { user_id: "u1", organization_id: "org-1" },
      { user_id: "u2", organization_id: "org-1" },
    ];
    state.emails = { u1: "a@example.se", u2: "b@example.se" };
    const result = await sendFirmClosedNotices({
      firmName: "X",
      organizationIds: ["org-1"],
      budgetMs: 0,
    });
    expect(result).toEqual({ sent: 0, failed: 2 });
    expect(state.sent).toEqual([]);
  });

  it("counts an owner whose address can't be read as failed", async () => {
    state.owners = [{ user_id: "gone", organization_id: "org-1" }];
    expect(await sendFirmClosedNotices({ firmName: "X", organizationIds: ["org-1"] })).toEqual({
      sent: 0,
      failed: 1,
    });
  });
});
