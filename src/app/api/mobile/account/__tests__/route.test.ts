import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  hasAnyMembership: vi.fn(),
  getDefaultOrganizationId: vi.fn(),
  homeCurrencyOf: vi.fn(),
  loadAccountantLinks: vi.fn(),
  planFirmExit: vi.fn(),
  loadFirstReceiptDate: vi.fn(),
  role: { value: "owner" as string | null },
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/organizations", () => ({
  hasAnyMembership: mocks.hasAnyMembership,
  getDefaultOrganizationId: mocks.getDefaultOrganizationId,
}));
vi.mock("@/lib/fx", () => ({ homeCurrencyOf: mocks.homeCurrencyOf }));
vi.mock("@/lib/firm/client-links", () => ({ loadAccountantLinks: mocks.loadAccountantLinks }));
vi.mock("@/lib/firm/account-exit", () => ({ planFirmExit: mocks.planFirmExit }));
vi.mock("@/lib/receipts/first-date", () => ({ loadFirstReceiptDate: mocks.loadFirstReceiptDate }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: mocks.role.value ? { role: mocks.role.value } : null }) }),
        }),
      }),
    }),
  }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "@/app/api/mobile/account/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@firma.se" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(USER);
  mocks.hasAnyMembership.mockResolvedValue(true);
  mocks.getDefaultOrganizationId.mockResolvedValue("org-1");
  mocks.homeCurrencyOf.mockResolvedValue("SEK");
  mocks.loadAccountantLinks.mockResolvedValue([]);
  mocks.planFirmExit.mockResolvedValue({ kind: "none" });
  mocks.loadFirstReceiptDate.mockResolvedValue("2025-03-14T10:00:00Z");
  mocks.role.value = "owner";
});

describe("GET /api/mobile/account", () => {
  it("answers 401 without a signed-in user, and never caches", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocks.loadAccountantLinks).not.toHaveBeenCalled();
  });

  it("returns display data only: no plan, price or usage", async () => {
    mocks.loadAccountantLinks.mockResolvedValue([
      {
        id: "l1",
        firmName: "Byrån AB",
        status: "active",
        since: "3 Nov 2026",
        acceptedAt: "2026-11-03T09:00:00Z",
        reminders: { optedOut: false, firmOn: true },
      },
    ]);
    const body = await (await GET()).json();
    expect(body).toEqual({
      email: USER.email,
      hasCompany: true,
      currency: { value: "SEK", options: ["EUR", "SEK", "USD", "GBP"], canChange: true },
      accountant: [
        {
          id: "l1",
          status: "active",
          name: "Byrån AB",
          since: "2026-11-03T09:00:00Z",
          reminders: { optedOut: false, firmOn: true },
        },
      ],
      firstMonth: "2025-03",
      firmExit: null,
    });
    expect(JSON.stringify(body)).not.toMatch(/plan|price|usage|€/i);
  });

  it("lets only an owner change the currency", async () => {
    mocks.role.value = "member";
    expect((await (await GET()).json()).currency.canChange).toBe(false);
  });

  it("gives firm-only staff no company data, and what happens to their firm", async () => {
    mocks.hasAnyMembership.mockResolvedValue(false);
    mocks.planFirmExit.mockResolvedValue({
      kind: "handover",
      firmId: "f1",
      firmName: "Byrån AB",
      successorMemberId: "m2",
      successorEmail: "eva@byran.se",
    });
    const body = await (await GET()).json();
    expect(body.hasCompany).toBe(false);
    expect(body.currency).toBeNull();
    expect(body.accountant).toEqual([]);
    expect(body.firmExit).toEqual({ kind: "handover", firmName: "Byrån AB", successorEmail: "eva@byran.se" });
  });

  it("says so when the firm can't be checked, so deleting waits", async () => {
    mocks.planFirmExit.mockRejectedValue(new Error("db down"));
    expect((await (await GET()).json()).firmExit).toBe("unknown");
  });
});
