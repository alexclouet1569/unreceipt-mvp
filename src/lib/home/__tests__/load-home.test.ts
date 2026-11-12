import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const m = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  getFirmMembership: vi.fn(),
  checkSubscriptionGate: vi.fn(),
  loadAccountantLinks: vi.fn(),
  getOrCreateAliasForUser: vi.fn(),
  getOrCreateDefaultOrganization: vi.fn(),
  hasAnyMembership: vi.fn(),
  homeCurrencyOf: vi.fn(),
  ensureHomeAmounts: vi.fn(),
  loadSummaryRows: vi.fn(),
}));

// A chain that answers each table with its canned row(s), however it's filtered.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const answer = () => m.tables[table] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const k of ["select", "eq", "order", "is"]) chain[k] = () => chain;
      chain.limit = async () => answer();
      chain.maybeSingle = async () => answer();
      return chain;
    },
  }),
}));
vi.mock("@/lib/require-firm", () => ({ getFirmMembership: m.getFirmMembership }));
vi.mock("@/lib/subscription-gate", () => ({ checkSubscriptionGate: m.checkSubscriptionGate }));
vi.mock("@/lib/firm/client-links", () => ({ loadAccountantLinks: m.loadAccountantLinks }));
vi.mock("@/lib/email-alias", () => ({
  getOrCreateAliasForUser: m.getOrCreateAliasForUser,
  buildForwardingAddress: (h: string) => `receipts+${h}@in.unreceipt.com`,
}));
vi.mock("@/lib/concierge-email", () => ({ getConciergeEmail: () => "concierge@unreceipt.com" }));
vi.mock("@/lib/organizations", () => ({
  getOrCreateDefaultOrganization: m.getOrCreateDefaultOrganization,
  hasAnyMembership: m.hasAnyMembership,
}));
vi.mock("@/lib/fx", () => ({ homeCurrencyOf: m.homeCurrencyOf, ensureHomeAmounts: m.ensureHomeAmounts }));
vi.mock("@/lib/analytics/load", () => ({ loadSummaryRows: m.loadSummaryRows }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { loadHome, RECENT_RECEIPTS_LIMIT } from "@/lib/home/load-home";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@firma.se" } as User;
const receipts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, currency: "EUR", total: 10 }));

beforeEach(() => {
  vi.clearAllMocks();
  m.tables = {
    receipts: { data: receipts(2), error: null },
    profiles: { data: { onboarded_at: "2026-11-01T00:00:00Z", email_alias_hash: "abc123" }, error: null },
    organizations: { data: { id: "org-1", currency: "EUR" }, error: null },
  };
  m.getFirmMembership.mockResolvedValue(null);
  m.checkSubscriptionGate.mockResolvedValue({ kind: "allow_with_warning", reason: "pilot_mode" });
  m.loadAccountantLinks.mockResolvedValue([]);
  m.ensureHomeAmounts.mockImplementation(async (rows: unknown[]) => rows);
  m.loadSummaryRows.mockResolvedValue([]);
  m.hasAnyMembership.mockResolvedValue(false);
});

describe("loadHome", () => {
  it("reads the alias and the company's currency up front: no mint, no extra currency read", async () => {
    const home = await loadHome(USER, null);
    expect(home.kind).toBe("ready");
    if (home.kind !== "ready") return;
    expect(m.getOrCreateAliasForUser).not.toHaveBeenCalled();
    expect(m.getOrCreateDefaultOrganization).not.toHaveBeenCalled();
    expect(m.homeCurrencyOf).not.toHaveBeenCalled();
    expect(m.ensureHomeAmounts).toHaveBeenCalledWith(expect.any(Array), "EUR");
    expect(home.data.homeCurrency).toBe("EUR");
    expect(home.data.forwardingEmail).toBe("receipts+abc123@in.unreceipt.com");
    expect(home.access).toBe("pilot");
    // Under the list's limit nothing older exists: no summary read.
    expect(m.loadSummaryRows).not.toHaveBeenCalled();
    expect(home.data.older).toMatchObject({ count: 0 });
  });

  it("mints the alias and the company on a first load, and reads the new company's currency", async () => {
    m.tables.profiles = { data: { onboarded_at: null, email_alias_hash: null }, error: null };
    m.tables.organizations = { data: null, error: null };
    m.tables.receipts = { data: [], error: null };
    m.getOrCreateAliasForUser.mockResolvedValue("new777");
    m.getOrCreateDefaultOrganization.mockResolvedValue("org-new");
    m.homeCurrencyOf.mockResolvedValue("SEK");
    const home = await loadHome(USER, null);
    if (home.kind !== "ready") throw new Error(home.kind);
    expect(m.getOrCreateDefaultOrganization).toHaveBeenCalledWith(USER.id);
    expect(m.homeCurrencyOf).toHaveBeenCalledWith("org-new");
    expect(home.data.homeCurrency).toBe("SEK");
    expect(home.data.forwardingEmail).toBe("receipts+new777@in.unreceipt.com");
    expect(home.data.showOnboarding).toBe(true);
  });

  it("never mints anything for firm-only staff or an account without a plan", async () => {
    m.tables.profiles = { data: { onboarded_at: null, email_alias_hash: null }, error: null };
    m.tables.organizations = { data: null, error: null };
    m.getFirmMembership.mockResolvedValue({ firm_id: "f1" });
    expect((await loadHome(USER, null)).kind).toBe("firm_only");

    m.getFirmMembership.mockResolvedValue(null);
    m.checkSubscriptionGate.mockResolvedValue({ kind: "redirect_subscribe" });
    expect((await loadHome(USER, null)).kind).toBe("subscribe");

    expect(m.getOrCreateAliasForUser).not.toHaveBeenCalled();
    expect(m.getOrCreateDefaultOrganization).not.toHaveBeenCalled();
    expect(m.loadSummaryRows).not.toHaveBeenCalled();
  });

  it("sums older receipts beside the conversion when the list is full, and gives null if that read fails", async () => {
    m.tables.receipts = { data: receipts(RECENT_RECEIPTS_LIMIT), error: null };
    m.loadSummaryRows.mockResolvedValue([]);
    const full = await loadHome(USER, null);
    if (full.kind !== "ready") throw new Error(full.kind);
    expect(m.loadSummaryRows).toHaveBeenCalledTimes(1);
    expect(full.data.older).not.toBeNull();

    m.loadSummaryRows.mockRejectedValue(new Error("db"));
    const failed = await loadHome(USER, null);
    if (failed.kind !== "ready") throw new Error(failed.kind);
    expect(failed.data.older).toBeNull();
    expect(failed.data.receipts).toHaveLength(RECENT_RECEIPTS_LIMIT);
  });

  it("counts a failed profile read as onboarded and falls back to minting the alias", async () => {
    m.tables.profiles = { data: null, error: { code: "42703" } };
    m.tables.receipts = { data: [], error: null };
    m.getOrCreateAliasForUser.mockResolvedValue(null);
    const home = await loadHome(USER, null);
    if (home.kind !== "ready") throw new Error(home.kind);
    expect(home.data.showOnboarding).toBe(false);
    expect(home.data.forwardingEmail).toBe("concierge@unreceipt.com");
  });
});
