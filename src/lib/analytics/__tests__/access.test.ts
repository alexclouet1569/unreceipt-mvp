import { beforeEach, describe, expect, it, vi } from "vitest";

// analyticsAccess(): which company decides the Insights currency and country.
// Sentry JAVASCRIPT-NEXTJS-2 ("analytics: no organization"): an employee has
// no company of their own (the home screen mints none for them), so Insights
// failed for every employee; after the "not ready yet" answer it would wait
// forever instead.

const mocks = vi.hoisted(() => ({
  getFirmMembership: vi.fn(),
  checkSubscriptionGate: vi.fn(),
  hasAnyMembership: vi.fn(),
  getEmployment: vi.fn(),
  ownOrganizationId: null as string | null,
  defaultReadError: null as { code: string } | null,
  organizations: new Map<string, { currency: string; country: string }>(),
  readOrganizationIds: [] as string[],
}));

vi.mock("@/lib/require-firm", () => ({ getFirmMembership: mocks.getFirmMembership }));
vi.mock("@/lib/subscription-gate", () => ({ checkSubscriptionGate: mocks.checkSubscriptionGate }));
vi.mock("@/lib/organizations", () => ({ hasAnyMembership: mocks.hasAnyMembership }));
vi.mock("@/lib/team/membership", () => ({ getEmployment: mocks.getEmployment }));
vi.mock("@/lib/fx", () => ({ ensureHomeAmounts: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      expect(table).toBe("organizations");
      return {
        select: () => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () => {
              if (column === "default_for_user_id") {
                if (mocks.defaultReadError) return { data: null, error: mocks.defaultReadError };
                return { data: mocks.ownOrganizationId ? { id: mocks.ownOrganizationId } : null, error: null };
              }
              mocks.readOrganizationIds.push(value);
              return { data: mocks.organizations.get(value) ?? null, error: null };
            },
          }),
        }),
      };
    },
  }),
}));

import type { User } from "@supabase/supabase-js";
import { AnalyticsNotReadyError, analyticsAccess } from "@/lib/analytics/load";

const USER = { id: "11111111-1111-4111-8111-111111111111" } as User;
const OWN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readOrganizationIds.length = 0;
  mocks.organizations.clear();
  mocks.organizations.set(OWN, { currency: "SEK", country: "SE" });
  mocks.organizations.set(EMPLOYER, { currency: "EUR", country: "FR" });
  mocks.ownOrganizationId = OWN;
  mocks.defaultReadError = null;
  mocks.getFirmMembership.mockResolvedValue(null);
  mocks.checkSubscriptionGate.mockResolvedValue({ kind: "allow" });
  mocks.hasAnyMembership.mockResolvedValue(true);
  mocks.getEmployment.mockResolvedValue(null);
});

describe("analyticsAccess", () => {
  it("uses the user's own company when they are not an employee", async () => {
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "ready", home: "SEK", country: "SE" });
    expect(mocks.readOrganizationIds).toEqual([OWN]);
  });

  it("uses the employer's company for an employee without a company of their own", async () => {
    mocks.ownOrganizationId = null;
    mocks.getEmployment.mockResolvedValue({ organizationId: EMPLOYER, role: "member", approverId: null });
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "ready", home: "EUR", country: "FR" });
  });

  it("uses the employer's currency even when the employee also has a company of their own", async () => {
    mocks.getEmployment.mockResolvedValue({ organizationId: EMPLOYER, role: "approver", approverId: null });
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "ready", home: "EUR", country: "FR" });
    expect(mocks.readOrganizationIds).toEqual([EMPLOYER]);
  });

  it("answers not ready (retry) for a new non-employee account whose company isn't created yet", async () => {
    mocks.ownOrganizationId = null;
    await expect(analyticsAccess(USER)).rejects.toBeInstanceOf(AnalyticsNotReadyError);
  });

  it("fails instead of guessing when a read fails", async () => {
    mocks.getEmployment.mockRejectedValue(new Error("employment read failed (XX000)"));
    await expect(analyticsAccess(USER)).rejects.toThrow("employment read failed");

    mocks.getEmployment.mockResolvedValue(null);
    mocks.defaultReadError = { code: "XX000" };
    const err = await analyticsAccess(USER).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(AnalyticsNotReadyError);
    expect(mocks.readOrganizationIds).toEqual([]);
  });

  it("keeps the firm-only and no-plan answers ahead of the company", async () => {
    mocks.getFirmMembership.mockResolvedValue({ firmId: "f" });
    mocks.hasAnyMembership.mockResolvedValue(false);
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "firm_only" });

    mocks.getFirmMembership.mockResolvedValue(null);
    mocks.checkSubscriptionGate.mockResolvedValue({ kind: "redirect_subscribe" });
    mocks.ownOrganizationId = null;
    await expect(analyticsAccess(USER)).resolves.toEqual({ kind: "inactive" });
  });
});
