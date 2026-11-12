import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: null | { code?: string; message: string } };

const state = vi.hoisted(() => ({
  orgReads: [] as Result[],
  profile: { data: null as unknown, error: null as Result["error"] },
  insert: { data: null as unknown, error: null as Result["error"] },
  membershipCount: { count: 0 as number | null, error: null as Result["error"] },
  calls: [] as Array<{ table: string; op: string; payload?: unknown }>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        const chain = {
          eq: async () => {
            if (table === "organizations") {
              return state.orgReads.shift() ?? { data: null, error: null };
            }
            if (table === "memberships" && opts?.head) {
              return state.membershipCount;
            }
            return { data: null, error: null };
          },
        };
        return {
          eq: () => ({
            maybeSingle: async () => {
              if (table === "organizations") {
                return state.orgReads.shift() ?? { data: null, error: null };
              }
              if (table === "profiles") return state.profile;
              return { data: null, error: null };
            },
            ...(opts?.head
              ? { then: (r: (v: unknown) => void) => r(state.membershipCount) }
              : {}),
          }),
          _chain: chain,
        };
      },
      insert: (payload: unknown) => {
        state.calls.push({ table, op: "insert", payload });
        return { select: () => ({ single: async () => state.insert }) };
      },
      upsert: async (payload: unknown, options: unknown) => {
        state.calls.push({ table, op: "upsert", payload: { payload, options } });
        return { error: null };
      },
    }),
  }),
}));

import {
  getDefaultOrganizationId,
  getOrCreateDefaultOrganization,
  hasAnyMembership,
} from "@/lib/organizations";

const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  state.orgReads = [];
  state.profile = { data: null, error: null };
  state.insert = { data: null, error: null };
  state.membershipCount = { count: 0, error: null };
  state.calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getDefaultOrganizationId", () => {
  it("returns the existing default organisation", async () => {
    state.orgReads = [{ data: { id: "org-1" }, error: null }];
    expect(await getDefaultOrganizationId(USER_ID)).toBe("org-1");
  });

  it("returns null when there is none or the read fails", async () => {
    state.orgReads = [{ data: null, error: null }];
    expect(await getDefaultOrganizationId(USER_ID)).toBeNull();
    state.orgReads = [{ data: null, error: { message: "boom" } }];
    expect(await getDefaultOrganizationId(USER_ID)).toBeNull();
  });
});

describe("getOrCreateDefaultOrganization", () => {
  it("returns the existing organisation and repairs a missing owner membership (idempotent)", async () => {
    state.orgReads = [{ data: { id: "org-1" }, error: null }];
    expect(await getOrCreateDefaultOrganization(USER_ID)).toBe("org-1");
    // No new company; only the owner upsert, which leaves an existing row alone.
    expect(state.calls).toEqual([
      {
        table: "memberships",
        op: "upsert",
        payload: {
          payload: { organization_id: "org-1", user_id: USER_ID, role: "owner" },
          options: { onConflict: "organization_id,user_id", ignoreDuplicates: true },
        },
      },
    ]);
  });

  it("creates one named after the company, plus the owner membership", async () => {
    state.orgReads = [{ data: null, error: null }];
    state.profile = { data: { company_name: "  Acme AB " }, error: null };
    state.insert = { data: { id: "org-new" }, error: null };

    expect(await getOrCreateDefaultOrganization(USER_ID)).toBe("org-new");

    expect(state.calls[0]).toEqual({
      table: "organizations",
      op: "insert",
      payload: { name: "Acme AB", default_for_user_id: USER_ID, created_by: USER_ID },
    });
    expect(state.calls[1]).toMatchObject({
      table: "memberships",
      op: "upsert",
      payload: {
        payload: { organization_id: "org-new", user_id: USER_ID, role: "owner" },
        options: { onConflict: "organization_id,user_id", ignoreDuplicates: true },
      },
    });
  });

  it("falls back to a generic name without a company name", async () => {
    state.orgReads = [{ data: null, error: null }];
    state.profile = { data: { company_name: "" }, error: null };
    state.insert = { data: { id: "org-new" }, error: null };
    await getOrCreateDefaultOrganization(USER_ID);
    expect(state.calls[0]!.payload).toMatchObject({ name: "My company" });
  });

  it("re-reads the winner when a concurrent call minted it first", async () => {
    state.orgReads = [
      { data: null, error: null },
      { data: { id: "org-winner" }, error: null },
    ];
    state.insert = { data: null, error: { code: "23505", message: "duplicate" } };

    expect(await getOrCreateDefaultOrganization(USER_ID)).toBe("org-winner");
    expect(state.calls.filter((c) => c.op === "upsert")).toHaveLength(1);
  });

  it("returns null on any other insert failure", async () => {
    state.orgReads = [{ data: null, error: null }];
    state.insert = { data: null, error: { code: "42P01", message: "no table" } };
    expect(await getOrCreateDefaultOrganization(USER_ID)).toBeNull();
    expect(state.calls.filter((c) => c.op === "upsert")).toHaveLength(0);
  });
});

describe("hasAnyMembership", () => {
  it("is true with a membership row and false without", async () => {
    state.membershipCount = { count: 2, error: null };
    expect(await hasAnyMembership(USER_ID)).toBe(true);
    state.membershipCount = { count: 0, error: null };
    expect(await hasAnyMembership(USER_ID)).toBe(false);
  });

  it("fails towards 'customer' when the count errors", async () => {
    state.membershipCount = { count: null, error: { message: "boom" } };
    expect(await hasAnyMembership(USER_ID)).toBe(true);
  });
});
