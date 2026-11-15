// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  optedOut: null as string | null,
  needs: { payments: [] as unknown[], receipts: [] as unknown[], toConfirm: 0 },
  owners: [{ user_id: "owner-1" }, { user_id: "owner-2" }],
  users: {} as Record<string, { email: string; email_confirmed_at: string | null }>,
  inserts: [] as unknown[],
  send: vi.fn(async () => ({ ok: true, id: "e" })),
}));

vi.mock("../weekly", () => ({ collectClientNeeds: async () => m.needs }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.send }));
vi.mock("@/lib/app-url", () => ({ absoluteAppUrl: (p: string) => `https://app.unreceipt.com${p}` }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: m.users[id] ?? null } }) } },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const f of ["select", "eq", "not", "order", "limit", "in", "update"]) chain[f] = () => chain;
      chain.insert = (row: unknown) => (m.inserts.push(row), Promise.resolve({ error: null }));
      chain.maybeSingle = async () =>
        table === "firm_clients"
          ? { data: { reminders_opted_out_at: m.optedOut }, error: null }
          : { data: { email: "eva@byran.se" }, error: null };
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(table === "memberships" ? { data: m.owners, error: null } : { data: null, error: null });
      return chain;
    },
  }),
}));

import { sendReminderNow } from "../now";

const OPTS = { firmId: "firm-1", firmName: "Byrån AB", firmClientId: "fc-1", organizationId: "org-1", clientName: "Hallonbergen" };

beforeEach(() => {
  m.optedOut = null;
  m.needs = { payments: [], receipts: [{ id: "r", merchant_name: "Byggmax", receipt_date: "2026-11-03", purchased_at: null, created_at: "2026-11-03T00:00:00Z", missing: "amount" }], toConfirm: 1 };
  m.users = {
    "owner-1": { email: "anna@hallon.se", email_confirmed_at: "2026-01-01" },
    "owner-2": { email: "typed@hallon.se", email_confirmed_at: null },
  };
  m.inserts = [];
  m.send.mockClear();
});

describe("sendReminderNow", () => {
  it("emails the confirmed owners only, with the firm's admin as Reply-To, and logs a manual reminder", async () => {
    expect(await sendReminderNow(OPTS)).toEqual({ ok: true, recipients: 1 });
    expect(m.send).toHaveBeenCalledTimes(1);
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: "anna@hallon.se", replyTo: "eva@byran.se", tag: "manual_reminder" }));
    expect(m.inserts).toEqual([expect.objectContaining({ organization_id: "org-1", firm_id: "firm-1", kind: "manual", review_count: 2, recipients: 1 })]);
  });

  it("respects the client's own choice to receive no reminders", async () => {
    m.optedOut = "2026-11-01T00:00:00Z";
    expect(await sendReminderNow(OPTS)).toEqual({ ok: false, reason: "opted_out" });
    expect(m.send).not.toHaveBeenCalled();
  });

  it("sends nothing when there is nothing to ask", async () => {
    m.needs = { payments: [], receipts: [], toConfirm: 0 };
    expect(await sendReminderNow(OPTS)).toEqual({ ok: false, reason: "nothing_to_ask" });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.inserts).toEqual([]);
  });
});
