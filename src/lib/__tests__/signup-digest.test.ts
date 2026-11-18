import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
  receipts: [] as Record<string, unknown>[],
  addresses: [] as Record<string, unknown>[],
  waitlist: [] as Record<string, unknown>[],
  waitlistRange: [] as string[],
  sent: [] as { to: string; subject: string; html: string; text: string; tag: string }[],
  sendOk: true,
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
      const rows =
        table === "profiles" ? state.profiles : table === "receipts" ? state.receipts : state.addresses;
      return {
        select: () => ({
          in: async (_c: string, ids: string[]) => ({
            data: rows.filter((r) => ids.includes(r.user_id as string)),
            error: null,
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/email/send", () => ({
  founderReplyTo: () => process.env.CONCIERGE_ADMIN_EMAILS?.split(",")[0] ?? null,
  sendEmail: async (email: (typeof state.sent)[number]) => {
    state.sent.push(email);
    return state.sendOk ? { ok: true, id: "e1" } : { ok: false, reason: "rejected", status: 500 };
  },
}));

import { digestFailed, digestWindow, runSignupDigest } from "@/lib/signup-digest";
import { attributionFrom, sanitizeSignupSource, withAttribution } from "@/lib/attribution";

const NOW = new Date("2026-10-18T19:37:00Z");

beforeEach(() => {
  process.env.CONCIERGE_ADMIN_EMAILS = "founder@example.com";
  state.users = [];
  state.profiles = [];
  state.receipts = [];
  state.addresses = [];
  state.waitlist = [];
  state.waitlistRange = [];
  state.sent = [];
  state.sendOk = true;
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
  it("sends nothing on a day without signups", async () => {
    state.users = [{ id: "old", email: "old@acme.se", created_at: "2026-10-01T10:00:00Z" }];
    const result = await runSignupDigest(NOW);
    expect(result).toEqual({ sent: false, reason: "no_signups", accounts: 0, waitlist: 0 });
    expect(state.sent).toHaveLength(0);
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
      { user_id: "u1", source: "captured" },
      { user_id: "u1", source: "email" },
    ];

    const result = await runSignupDigest(NOW);

    expect(result).toEqual({ sent: true, accounts: 1, waitlist: 0 });
    const [email] = state.sent;
    expect(email.to).toBe("founder@example.com");
    expect(email.tag).toBe("signup_digest");
    expect(email.subject).toBe("UnReceipt: 1 new account in the last 24 hours");
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
    expect(state.sent[0].subject).toBe("UnReceipt: 1 waitlist sign-up in the last 24 hours");
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

describe("runSignupDigest: where a signup came from", () => {
  it("shows test / x / /sv for a sign-up started on /sv?utm_source=test&utm_campaign=x", async () => {
    // The marketing page's link at click time (src/lib/tracking/links.ts)…
    const href = withAttribution(
      "https://app.unreceipt.com/app/login?mode=signup",
      attributionFrom("https://unreceipt.com/sv?utm_source=test&utm_campaign=x", "")
    );
    // …read back by /app/login and saved on the new account.
    const signupSource = sanitizeSignupSource(new URL(href).searchParams);
    state.users = [
      {
        id: "u1",
        email: "anna@bygg-ab.se",
        created_at: "2026-10-18T08:15:00Z",
        user_metadata: { full_name: "Anna Berg", signup_source: signupSource },
      },
    ];

    await runSignupDigest(NOW);

    const [email] = state.sent;
    expect(email.text).toContain("Source: test / x / /sv");
    expect(email.html).toContain("Source: test / x / /sv");
  });

  it("prefers the profile's copy and checks it again", async () => {
    state.users = [
      {
        id: "u1",
        email: "anna@bygg-ab.se",
        created_at: "2026-10-18T08:15:00Z",
        email_confirmed_at: "2026-10-18T08:16:00Z",
        user_metadata: { signup_source: { utm_source: "edited-later" } },
      },
    ];
    state.profiles = [
      { user_id: "u1", full_name: "Anna", signup_source: { utm_source: "linkedin", utm_campaign: "outreach", landing: "/sv", x: "y" } },
    ];

    await runSignupDigest(NOW);

    expect(state.sent[0].text).toContain("Source: linkedin / outreach / /sv");
    expect(state.sent[0].text).not.toContain("edited-later");
  });

  it("says unknown, escaped, when there is no source", async () => {
    state.users = [
      {
        id: "u1",
        email: "anna@bygg-ab.se",
        created_at: "2026-10-18T08:15:00Z",
        user_metadata: { signup_source: { utm_source: "<img src=x>" } },
      },
    ];

    await runSignupDigest(NOW);

    expect(state.sent[0].text).toContain("Source: unknown");
    expect(state.sent[0].html).not.toContain("<img");
  });
});

describe("digestFailed", () => {
  it("reports a failed send so the cron run shows as failed", async () => {
    state.sendOk = false;
    state.waitlist = [{ email: "x@acme.fr", source: null, signed_up_at: "2026-10-18T12:00:00Z" }];
    const result = await runSignupDigest(NOW);
    expect(result).toMatchObject({ sent: false, reason: "send_failed" });
    expect(digestFailed(result)).toBe(true);
  });

  it("fails without a founder address, but not on a quiet day or a sent digest", () => {
    expect(digestFailed({ sent: false, reason: "no_recipient", accounts: 0, waitlist: 1 })).toBe(true);
    expect(digestFailed({ sent: false, reason: "no_signups", accounts: 0, waitlist: 0 })).toBe(false);
    expect(digestFailed({ sent: true, accounts: 1, waitlist: 0 })).toBe(false);
  });
});
