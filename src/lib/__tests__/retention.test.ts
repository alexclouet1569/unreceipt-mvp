// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  subs: [] as unknown[],
  records: [] as unknown[],
  users: {} as Record<string, string | null>,
  upserts: [] as unknown[],
  sendEmail: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/account-deletion", () => ({ deleteAccount: state.deleteAccount }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: state.sendEmail,
  founderReplyTo: () => "founder@unreceipt.com",
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      table === "subscriptions"
        ? { select: async () => ({ data: state.subs, error: null }) }
        : {
            select: () => ({ in: async () => ({ data: state.records, error: null }) }),
            upsert: async (row: unknown) => {
              state.upserts.push(row);
              return { error: null };
            },
          },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: id in state.users ? { id, email: state.users[id] } : null },
          error: null,
        }),
      },
    },
  }),
}));

import {
  deletionDate,
  endedAccounts,
  retentionAction,
  runRetention,
} from "@/lib/retention";

const DAY = 24 * 60 * 60 * 1000;
const ENDED = new Date("2026-06-01T00:00:00.000Z");
const at = (days: number) => new Date(ENDED.getTime() + days * DAY);
const U1 = "11111111-1111-4111-8111-111111111111";

const sub = (o: Record<string, unknown> = {}) => ({
  user_id: U1,
  status: "canceled",
  ended_at: ENDED.toISOString(),
  current_period_end: null,
  updated_at: null,
  ...o,
});

describe("endedAccounts", () => {
  it("ignores users with a live subscription and takes the latest end", () => {
    const later = "2026-07-01T00:00:00.000Z";
    const map = endedAccounts([
      sub(),
      sub({ ended_at: later }),
      sub({ user_id: "live", status: "canceled" }),
      sub({ user_id: "live", status: "active", ended_at: null }),
      sub({ user_id: "trial", status: "trialing", ended_at: null }),
    ]);
    expect([...map.keys()]).toEqual([U1]);
    expect(map.get(U1)!.toISOString()).toBe(later);
  });

  it("falls back to the period end for rows written before ended_at", () => {
    const map = endedAccounts([
      sub({ ended_at: null, current_period_end: "2026-05-15T00:00:00.000Z" }),
    ]);
    expect(map.get(U1)!.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });
});

describe("retentionAction", () => {
  const record = (sentDay: number, ended = ENDED) => ({
    ended_at: ended.toISOString(),
    reminder_sent_at: at(sentDay).toISOString(),
  });

  it("does nothing until 14 days before the 90-day mark", () => {
    expect(retentionAction(ENDED, null, at(75))).toBe("none");
    expect(retentionAction(ENDED, null, at(76))).toBe("remind");
  });

  it("deletes at 90 days only after the reminder for this cancellation", () => {
    expect(retentionAction(ENDED, record(76), at(89))).toBe("wait");
    expect(retentionAction(ENDED, record(76), at(90))).toBe("delete");
    // A reminder about an earlier cancellation doesn't count.
    expect(retentionAction(ENDED, record(76, new Date("2026-01-01")), at(120))).toBe("remind");
  });

  it("always leaves 14 days after a late reminder", () => {
    expect(retentionAction(ENDED, record(100), at(110))).toBe("wait");
    expect(retentionAction(ENDED, record(100), at(114))).toBe("delete");
    expect(deletionDate(ENDED, at(100)).toISOString()).toBe(at(114).toISOString());
  });
});

describe("runRetention", () => {
  beforeEach(() => {
    state.subs = [sub()];
    state.records = [];
    state.users = { [U1]: "owner@example.se" };
    state.upserts = [];
    state.sendEmail.mockReset().mockResolvedValue({ ok: true, id: "e1" });
    state.deleteAccount.mockReset().mockResolvedValue({});
  });

  it("emails the reminder and records it", async () => {
    const res = await runRetention(at(77));
    expect(res.reminded).toBe(1);
    const email = state.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("owner@example.se");
    expect(email.tag).toBe("retention_reminder");
    // Sent on day 77, so deletion is 14 days later (day 91), not day 90.
    expect(email.subject).toContain("31 August 2026");
    expect(state.upserts).toEqual([
      { user_id: U1, ended_at: ENDED.toISOString(), reminder_sent_at: at(77).toISOString() },
    ]);
    expect(state.deleteAccount).not.toHaveBeenCalled();
  });

  it("doesn't record (or later delete) when the email fails", async () => {
    state.sendEmail.mockResolvedValueOnce({ ok: false, reason: "rejected" });
    const res = await runRetention(at(95));
    expect(res.failed).toBe(1);
    expect(state.upserts).toEqual([]);
    expect(state.deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes once the date in the reminder has passed", async () => {
    state.records = [
      { user_id: U1, ended_at: ENDED.toISOString(), reminder_sent_at: at(76).toISOString() },
    ];
    const res = await runRetention(at(91));
    expect(res.deleted).toBe(1);
    expect(state.deleteAccount).toHaveBeenCalledWith(U1, { email: "owner@example.se" });
  });

  it("never deletes an admin account", async () => {
    state.users = { [U1]: "founder@unreceipt.com" };
    process.env.CONCIERGE_ADMIN_EMAILS = "founder@unreceipt.com";
    state.records = [
      { user_id: U1, ended_at: ENDED.toISOString(), reminder_sent_at: at(76).toISOString() },
    ];
    const res = await runRetention(at(120));
    expect(res.skipped).toBe(1);
    expect(state.deleteAccount).not.toHaveBeenCalled();
    delete process.env.CONCIERGE_ADMIN_EMAILS;
  });
});
