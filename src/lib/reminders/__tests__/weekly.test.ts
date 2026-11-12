// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  sendEmail: vi.fn(),
  loadBankMonth: vi.fn(),
}));

// Just enough of the query builder: filters, order/limit, insert with the
// weekly unique index, update, delete.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { email: `${id}@client.se`, email_confirmed_at: id === "owner-unconfirmed" ? null : "2026-01-01" } },
        }),
      },
    },
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let mode: "select" | "insert" | "update" | "delete" = "select";
      let payload: Row = {};
      const rows = () => (mocks.db[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (mode === "insert") {
          const row: Row = { id: `${table}-${(mocks.db[table] ?? []).length + 1}`, ...payload };
          if (
            table === "client_reminders" &&
            row.kind === "weekly" &&
            (mocks.db[table] ?? []).some((r) => r.kind === "weekly" && r.organization_id === row.organization_id && r.week === row.week)
          ) {
            return { data: null, error: { code: "23505" } };
          }
          (mocks.db[table] ??= []).push(row);
          return { data: row, error: null };
        }
        if (mode === "update") {
          const hit = rows();
          for (const r of hit) Object.assign(r, payload);
          return { data: hit, error: null };
        }
        if (mode === "delete") {
          const gone = new Set(rows());
          mocks.db[table] = (mocks.db[table] ?? []).filter((r) => !gone.has(r));
          return { data: null, error: null };
        }
        return { data: rows(), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (p: Row) => ((mode = "insert"), (payload = p), q),
        update: (p: Row) => ((mode = "update"), (payload = p), q),
        delete: () => ((mode = "delete"), q),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        gte: () => q,
        not: (c: string) => (filters.push((r) => r[c] != null), q),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
        order: () => q,
        limit: () => q,
        single: async () => {
          const res = run();
          return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error };
        },
        maybeSingle: async () => {
          const res = run();
          return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error };
        },
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/fx", () => ({ homeCurrencyOf: async () => "SEK" }));
vi.mock("@/lib/bank/load", () => ({ loadBankMonth: mocks.loadBankMonth }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/app-url", () => ({
  appUrl: (p: string) => `https://app.unreceipt.com${p}`,
  absoluteAppUrl: (p: string) => `https://app.unreceipt.com${p}`,
}));

import { isoWeek, runWeeklyReminders, stockholmDay } from "../weekly";

// Monday 16 November 2026, 07:10 in Stockholm.
const MONDAY = new Date("2026-11-16T06:10:00Z");

const missingLine = (id: string, bookedOn: string) => ({
  id,
  bookedOn,
  amount: -1249,
  currency: "SEK",
  description: "HORNBACH BARKARBY",
  state: { kind: "missing" },
  receipt: null,
  remindedAt: null,
});

beforeEach(() => {
  mocks.db = {
    firm_clients: [
      { firm_id: "firm-1", organization_id: "org-a", client_name: "Acme AB", status: "active", weekly_reminder: true, firms: { name: "Byrån AB" } },
      { firm_id: "firm-1", organization_id: "org-off", client_name: "Off AB", status: "active", weekly_reminder: false, firms: { name: "Byrån AB" } },
      { firm_id: "firm-1", organization_id: "org-quiet", client_name: "Quiet AB", status: "active", weekly_reminder: true, firms: { name: "Byrån AB" } },
      // The client said no: the firm's switch doesn't matter.
      { firm_id: "firm-1", organization_id: "org-optout", client_name: "No AB", status: "active", weekly_reminder: true, reminders_opted_out_at: "2026-11-10T08:00:00Z", firms: { name: "Byrån AB" } },
    ],
    firm_members: [{ firm_id: "firm-1", email: "anna@byran.se", role: "admin", user_id: "u-anna" }],
    memberships: [
      { organization_id: "org-a", user_id: "owner-a", role: "owner" },
      { organization_id: "org-quiet", user_id: "owner-q", role: "owner" },
      { organization_id: "org-a", user_id: "owner-unconfirmed", role: "owner" },
      { organization_id: "org-optout", user_id: "owner-o", role: "owner" },
    ],
    receipts: [
      { id: "r1", organization_id: "org-a", status: "pending_review", merchant_name: null, total: null, receipt_date: "2026-11-10", purchased_at: null, created_at: "2026-11-10T08:00:00Z" },
      // Waiting for a confirmation only: not something to chase the client for.
      { id: "r2", organization_id: "org-a", status: "pending_review", merchant_name: "Ahlsell", total: 3912.5, receipt_date: "2026-11-02", purchased_at: null, created_at: "2026-11-02T08:00:00Z" },
    ],
    bank_transactions: [{ id: "b1", organization_id: "org-a" }],
    client_reminders: [],
  };
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true, id: "e" });
  mocks.loadBankMonth.mockReset().mockImplementation(async (org: string, month: string) => ({
    lines:
      org === "org-a" && month === "2026-11"
        ? [missingLine("b1", "2026-11-05"), missingLine("b-yesterday", "2026-11-15")]
        : [],
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("calendar helpers", () => {
  it("reads the Stockholm day and ISO week", () => {
    expect(stockholmDay(MONDAY)).toEqual({ day: "2026-11-16", month: "2026-11", weekday: 1 });
    // 23:30 UTC Sunday is already Monday in Stockholm.
    expect(stockholmDay(new Date("2026-11-15T23:30:00Z")).weekday).toBe(1);
    expect(isoWeek("2026-11-16")).toBe("2026-W47");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});

describe("runWeeklyReminders", () => {
  it("emails each company with something missing, once, with the firm as Reply-To", async () => {
    const result = await runWeeklyReminders(MONDAY);
    expect(result).toMatchObject({ ran: true, week: "2026-W47", links: 2, sent: 1, nothingToAsk: 1, failed: 0 });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: "owner-a@client.se", replyTo: "anna@byran.se", tag: "weekly_reminder" });
    expect(mail.subject).toBe("Byrån AB is waiting for 1 receipt for bank payments, 1 receipt to complete and 1 to confirm");
    expect(mail.text).toContain("HORNBACH BARKARBY");
    // Booked yesterday: too early to chase.
    expect(mail.text.match(/HORNBACH/g)).toHaveLength(1);
    expect(mail.text).toContain("missing merchant and amount");
    // Waiting for a confirmation: counted, not listed.
    expect(mail.text).not.toContain("Ahlsell");
    expect(mail.text).toContain("1 receipt was read automatically and waits for your confirmation");
    expect(mail.text).toContain("To stop these weekly emails: Settings, Your accountant. https://app.unreceipt.com/app/settings");

    expect(mocks.db.client_reminders).toEqual([
      // The unconfirmed owner's address got nothing.
      expect.objectContaining({ organization_id: "org-a", kind: "weekly", week: "2026-W47", missing_count: 1, review_count: 2, recipients: 1 }),
    ]);
    expect(mocks.db.bank_transactions[0].reminded_at).toEqual(expect.any(String));

    // Same week again: nothing more.
    const again = await runWeeklyReminders(new Date("2026-11-17T06:10:00Z"));
    expect(again).toMatchObject({ sent: 0, alreadySent: 1 });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a company already emailed this week before reading its bank lines or receipts", async () => {
    mocks.db.client_reminders = [{ id: "cr-0", organization_id: "org-a", kind: "weekly", week: "2026-W47" }];
    const result = await runWeeklyReminders(MONDAY);
    expect(result).toMatchObject({ alreadySent: 1, sent: 0, nothingToAsk: 1 });
    expect(mocks.loadBankMonth).not.toHaveBeenCalledWith("org-a", expect.anything(), expect.anything());
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("sends only Monday to Wednesday unless forced", async () => {
    expect((await runWeeklyReminders(new Date("2026-11-19T06:10:00Z"))).ran).toBe(false);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect((await runWeeklyReminders(new Date("2026-11-19T06:10:00Z"), { force: true })).sent).toBe(1);
  });

  it("gives the claim back when no email went out, so a later run retries", async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, reason: "rejected" });
    expect((await runWeeklyReminders(MONDAY)).failed).toBe(1);
    expect(mocks.db.client_reminders).toEqual([]);
    expect(mocks.db.bank_transactions[0].reminded_at).toBeUndefined();

    mocks.sendEmail.mockResolvedValue({ ok: true, id: "e" });
    expect((await runWeeklyReminders(new Date("2026-11-17T06:10:00Z"))).sent).toBe(1);
  });

  it("counts a company whose bank lines can't be read as failed and carries on", async () => {
    mocks.loadBankMonth.mockResolvedValue(null);
    const result = await runWeeklyReminders(MONDAY);
    expect(result).toMatchObject({ failed: 2, sent: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
