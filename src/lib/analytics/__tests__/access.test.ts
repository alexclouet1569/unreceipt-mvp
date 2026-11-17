import { beforeEach, describe, expect, it, vi } from "vitest";

// analyticsAccess(): which company decides the Insights currency and country.
// Sentry JAVASCRIPT-NEXTJS-2 ("analytics: no organization"): an employee has
// no company of their own (the home screen mints none for them), so Insights
// answered 500 for every employee.

const mocks = vi.hoisted(() => ({
  getFirmMembership: vi.fn(),
  checkSubscriptionGate: vi.fn(),
  getDefaultOrganizationId: vi.fn(),
  hasAnyMembership: vi.fn(),
  getEmployment: vi.fn(),
  organizations: new Map<string, { currency: string; country: string }>(),
  readOrganizationIds: [] as string[],
}));

vi.mock("@/lib/require-firm", () => ({ getFirmMembership: mocks.getFirmMembership }));
vi.mock("@/lib/subscription-gate", () => ({ checkSubscriptionGate: mocks.checkSubscriptionGate }));
vi.mock("@/lib/organizations", () => ({
  getDefaultOrganizationId: mocks.getDefaultOrganizationId,
  hasAnyMembership: mocks.hasAnyMembership,
}));
vi.mock("@/lib/team/membership", () => ({ getEmployment: mocks.getEmployment }));
vi.mock("@/lib/fx", () => ({ ensureHomeAmounts: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      expect(table).toBe("organizations");
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => {
              mocks.readOrganizationIds.push(id);
              return { data: mocks.organizations.get(id) ?? null, error: null };
            },
          }),
        }),
      };
    },
  }),
}));

import type { User } from "@supabase/supabase-js";
import { analyticsAccess } from "@/lib/analytics/load";

const USER = { id: "11111111-1111-4111-8111-111111111111" } as User;
const OWN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readOrganizationIds.length = 0;
  mocks.organizations.clear();
  mocks.organizations.set(OWN, { currency: "SEK", country: "SE" });
  mocks.organizations.set(EMPLOYER, { currency: "EUR", country: "FR" });
  mocks.getFirmMembership.mockResolvedValue(null);
  mocks.checkSubscriptionGate.mockResolvedValue({ kind: "allow" });
  mocks.getDefaultOrganizationId.mockResolvedValue(OWN);
  mocks.hasAnyMembership.mockResolvedValue(true);
  mocks.getEmployment.mockResolvedValue(null);
});

describe("analyticsAccess", () => {
  it("uses the user's own company when they are not an employee", async () => {
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "ready", home: "SEK", country: "SE" });
    expect(mocks.readOrganizationIds).toEqual([OWN]);
  });

  it("uses the employer's company for an employee without a company of their own", async () => {
    mocks.getDefaultOrganizationId.mockResolvedValue(null);
    mocks.getEmployment.mockResolvedValue({ organizationId: EMPLOYER, role: "member", approverId: null });
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "ready", home: "EUR", country: "FR" });
  });

  it("uses the employer's currency even when the employee also has a company of their own", async () => {
    mocks.getEmployment.mockResolvedValue({ organizationId: EMPLOYER, role: "approver", approverId: null });
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "ready", home: "EUR", country: "FR" });
    expect(mocks.readOrganizationIds).toEqual([EMPLOYER]);
  });

  it("still refuses to guess when there is no company at all", async () => {
    mocks.getDefaultOrganizationId.mockResolvedValue(null);
    await expect(analyticsAccess(USER)).rejects.toThrow("analytics: no organization");
  });

  it("fails instead of guessing when the employment read fails", async () => {
    mocks.getEmployment.mockRejectedValue(new Error("employment read failed (XX000)"));
    await expect(analyticsAccess(USER)).rejects.toThrow("employment read failed");
    expect(mocks.readOrganizationIds).toEqual([]);
  });

  it("keeps the firm-only and no-plan answers ahead of the company", async () => {
    mocks.getFirmMembership.mockResolvedValue({ firmId: "f" });
    mocks.hasAnyMembership.mockResolvedValue(false);
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "firm_only" });

    mocks.getFirmMembership.mockResolvedValue(null);
    mocks.checkSubscriptionGate.mockResolvedValue({ kind: "redirect_subscribe" });
    mocks.getDefaultOrganizationId.mockResolvedValue(null);
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "inactive" });
  });
});
