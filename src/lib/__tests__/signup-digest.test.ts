import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
  receipts: [] as Record<string, unknown>[],
  addresses: [] as Record<string, unknown>[],
  waitlist: [] as Record<string, unknown>[],
  waitlistRange: [] as string[],
  usage: [] as Record<string, unknown>[],
  sent: [] as { to: string; subject: string; html: string; text: string; tag: string }[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        listUsers: async ({ page }: { page: number }) => ({
          data: { users: page === 1 ? state.users : [] },
          error: null,
        }),
      },
    },
    from: (table: string) => {
      if (table === "waitlist") {
        const chain = {
          select: () => chain,
          gte: (_c: string, v: string) => (state.waitlistRange.push(v), chain),
          lt: (_c: string, v: string) => (state.waitlistRange.push(v), chain),
          order: () => chain,
          limit: async () => ({ data: state.waitlist, error: null }),
        };
        return chain;
      }
      return query(table);
    },
  }),
}));

type Row = Record<string, unknown>;

// Enough of the PostgREST builder for the digest: filters apply in memory,
// `head: true` gives back a count.
function query(table: string) {
  const all = (): Row[] =>
    table === "profiles"
      ? state.profiles
      : table === "receipts"
        ? state.receipts
        : table === "receipt_usage"
          ? state.usage
          : state.addresses;
  const filters: ((r: Row) => boolean)[] = [];
  let head = false;
  const q = {
    select: (_c: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), q),
    in: async (_c: string, ids: string[]) => ({
      data: all().filter((r) => ids.includes(r.user_id as string)),
      error: null,
    }),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    is: (c: string, v: null) => (filters.push((r) => (r[c] ?? null) === v), q),
    not: (c: string, op: string, v: unknown) => {
      if (op === "in") {
        const ids = String(v).slice(1, -1).split(",");
        filters.push((r) => !ids.includes(r[c] as string));
      } else {
        filters.push((r) => (r[c] ?? null) !== v);
      }
      return q;
    },
    then: (resolve: (v: unknown) => void) => {
      const data = all().filter((r) => filters.every((f) => f(r)));
      resolve(head ? { data: null, count: data.length, error: null } : { data, error: null });
    },
  };
  return q;
}

vi.mock("@/lib/email/send", () => ({
  founderReplyTo: () => process.env.CONCIERGE_ADMIN_EMAILS?.split(",")[0] ?? null,
  sendEmail: async (email: (typeof state.sent)[number]) => {
    state.sent.push(email);
    return { ok: true, id: "e1" };
  },
}));

import { digestWindow, runSignupDigest } from "@/lib/signup-digest";

const NOW = new Date("2026-10-18T19:37:00Z");

beforeEach(() => {
  process.env.CONCIERGE_ADMIN_EMAILS = "founder@example.com";
  state.users = [];
  state.profiles = [];
  state.receipts = [];
  state.addresses = [];
  state.waitlist = [];
  state.waitlistRange = [];
  state.usage = [];
  state.sent = [];
  delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

describe("digestWindow", () => {
  it("covers the 24 hours before the start of the current hour", () => {
    const w = digestWindow(NOW);
    expect(w.end.toISOString()).toBe("2026-10-18T19:00:00.000Z");
    expect(w.start.toISOString()).toBe("2026-10-17T19:00:00.000Z");
  });

  it("gives back-to-back windows for runs anywhere in the scheduled hour", () => {
    const a = digestWindow(new Date("2026-10-17T19:02:00Z"));
    const b = digestWindow(new Date("2026-10-18T19:58:00Z"));
    expect(b.start.getTime()).toBe(a.end.getTime());
  });
});

describe("runSignupDigest", () => {
  it("still sends on a day without signups, so silence means the job broke", async () => {
    state.users = [{ id: "old", email: "old@acme.se", created_at: "2026-10-01T10:00:00Z" }];
    const result = await runSignupDigest(NOW);
    expect(result).toEqual({ sent: true, accounts: 0, waitlist: 0 });
    const [email] = state.sent;
    expect(email.subject).toBe("UnReceipt: No new sign-ups in the last 24 hours · no receipts added");
    expect(email.text).toContain("1 accounts in total");
    expect(email.text).toContain("Receipts added: none");
    expect(email.text).not.toContain("If you get them on a call");
  });

  it("reports the app's activity in the window and leaves admin receipts out", async () => {
    process.env.VERCEL_GIT_COMMIT_MESSAGE = "Fix receipt save (#92)\n\n* details";
    process.env.VERCEL_GIT_COMMIT_SHA = "0144bc8c11f3d1d649fbb71d9e785b9bc19ce96f";
    state.users = [
      { id: "a", email: "a@acme.se", created_at: "2026-10-01T10:00:00Z", last_sign_in_at: "2026-10-18T09:00:00Z" },
      { id: "b", email: "b@acme.se", created_at: "2026-10-01T10:00:00Z", last_sign_in_at: "2026-10-16T09:00:00Z" },
      { id: "admin", email: "founder@example.com", created_at: "2026-10-01T10:00:00Z", last_sign_in_at: "2026-10-18T10:00:00Z" },
    ];
    state.receipts = [
      { id: "r1", user_id: "a", source: "paper", status: "verified", created_at: "2026-10-18T09:05:00Z" },
      { id: "r2", user_id: "a", source: "email", status: "pending_review", created_at: "2026-10-18T11:00:00Z" },
      { id: "r3", user_id: "b", source: "email", status: "pending_review", created_at: "2026-10-10T11:00:00Z" },
      { id: "r4", user_id: "b", source: "paper", status: "verified", created_at: "2026-10-18T19:30:00Z" },
      { id: "r5", user_id: "admin", source: "paper", status: "pending_review", created_at: "2026-10-18T12:00:00Z" },
    ];
    state.usage = [
      { receipt_id: "r1", user_id: "a", overage_attempted_at: "2026-10-18T09:05:01Z", overage_billed_at: null },
      { receipt_id: "r2", user_id: "a", overage_attempted_at: null, overage_billed_at: null },
      { receipt_id: "r5", user_id: "admin", overage_attempted_at: "2026-10-18T12:00:01Z", overage_billed_at: null },
    ];

    await runSignupDigest(NOW);

    const [email] = state.sent;
    expect(email.subject).toBe("UnReceipt: No new sign-ups in the last 24 hours · 2 receipts added");
    expect(email.text).toContain("Receipts added: 2 (1 photo/upload, 1 forwarded) by 1 person");
    expect(email.text).toContain("Signed in: 1 account");
    expect(email.text).toContain("Waiting in Review needed: 2 (all accounts, all time)");
    expect(email.text).toContain("Receipts in total: 4");
    expect(email.text).toContain("Needs a look: 1 extra-receipt charge sent to Stripe but never confirmed");
    expect(email.text).toContain("Live version: Fix receipt save (#92) (0144bc8)");
  });

  it("lists new accounts with their progress and leaves admins and out-of-window users out", async () => {
    state.users = [
      {
        id: "u1",
        email: "anna@bygg-ab.se",
        created_at: "2026-10-18T08:15:00Z",
        email_confirmed_at: "2026-10-18T08:16:00Z",
        app_metadata: { provider: "email" },
      },
      { id: "admin", email: "founder@example.com", created_at: "2026-10-18T09:00:00Z" },
      { id: "late", email: "late@acme.se", created_at: "2026-10-18T19:10:00Z" },
      { id: "old", email: "old@acme.se", created_at: "2026-10-17T18:59:00Z" },
    ];
    state.profiles = [{ user_id: "u1", full_name: "Anna Berg", company_name: "Bygg AB", onboarded_at: null }];
    state.receipts = [
      { user_id: "u1", source: "captured", status: "verified", created_at: "2026-10-18T08:20:00Z" },
      { user_id: "u1", source: "email", status: "verified", created_at: "2026-10-18T08:30:00Z" },
    ];

    const result = await runSignupDigest(NOW);

    expect(result).toEqual({ sent: true, accounts: 1, waitlist: 0 });
    const [email] = state.sent;
    expect(email.to).toBe("founder@example.com");
    expect(email.tag).toBe("signup_digest");
    expect(email.subject).toBe("UnReceipt: 1 new account in the last 24 hours · 2 receipts added");
    expect(email.text).toContain("Anna Berg · Bygg AB");
    expect(email.text).toContain("https://bygg-ab.se");
    expect(email.text).toContain("2 receipts (1 photo/upload, 1 forwarded)");
    expect(email.text).toContain("3 accounts in total");
    expect(email.text).not.toContain("founder@example.com");
    expect(email.text).not.toContain("late@acme.se");
    expect(email.html).toContain("mailto:anna%40bygg-ab.se?subject=");
  });

  it("sends for waitlist sign-ups alone and queries the same window", async () => {
    state.waitlist = [{ email: "x@acme.fr", source: "landing_page", signed_up_at: "2026-10-18T12:00:00Z" }];
    const result = await runSignupDigest(NOW);
    expect(result).toEqual({ sent: true, accounts: 0, waitlist: 1 });
    expect(state.waitlistRange).toEqual(["2026-10-17T19:00:00.000Z", "2026-10-18T19:00:00.000Z"]);
    expect(state.sent[0].subject).toBe("UnReceipt: 1 waitlist sign-up in the last 24 hours · no receipts added");
    expect(state.sent[0].text).not.toContain("If you get them on a call");
  });

  it("doesn't send without a founder address", async () => {
    delete process.env.CONCIERGE_ADMIN_EMAILS;
    state.waitlist = [{ email: "x@acme.fr", source: null, signed_up_at: "2026-10-18T12:00:00Z" }];
    const result = await runSignupDigest(NOW);
    expect(result).toMatchObject({ sent: false, reason: "no_recipient" });
    expect(state.sent).toHaveLength(0);
  });
});
