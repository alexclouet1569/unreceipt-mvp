// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

// Rows per table, as { user_id } lists; `failing` makes a table's read fail.
const db = vi.hoisted(() => ({
  rows: {} as Record<string, string[]>,
  failing: new Set<string>(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async (_col: string, userId: string) =>
          db.failing.has(table)
            ? { count: null, error: { code: "XX000" } }
            : { count: (db.rows[table] ?? []).filter((id) => id === userId).length, error: null },
      }),
    }),
  }),
}));

import { checkMayHaveCompany, checkMayJoinFirm } from "@/lib/account-roles";

beforeEach(() => {
  db.rows = {};
  db.failing = new Set();
});

describe("one account, one role", () => {
  it("lets a new account become either", async () => {
    expect(await checkMayJoinFirm("u1")).toBe("ok");
    expect(await checkMayHaveCompany("u1")).toBe("ok");
  });

  it("keeps a company account out of firms", async () => {
    db.rows.memberships = ["u1"];
    expect(await checkMayJoinFirm("u1")).toBe("blocked");
    expect(await checkMayHaveCompany("u1")).toBe("ok");
  });

  it("keeps a firm account out of companies", async () => {
    db.rows.firm_members = ["u1"];
    expect(await checkMayHaveCompany("u1")).toBe("blocked");
    expect(await checkMayJoinFirm("u1")).toBe("ok");
  });

  it("lets an exempt account hold both", async () => {
    db.rows.memberships = ["u1"];
    db.rows.firm_members = ["u1"];
    db.rows.account_role_exemptions = ["u1"];
    expect(await checkMayJoinFirm("u1")).toBe("ok");
    expect(await checkMayHaveCompany("u1")).toBe("ok");
  });

  it("says it couldn't tell, rather than allowing, when a read fails", async () => {
    db.failing.add("memberships");
    expect(await checkMayJoinFirm("u1")).toBe("error");
    db.failing = new Set(["account_role_exemptions"]);
    db.rows.firm_members = ["u1"];
    expect(await checkMayHaveCompany("u1")).toBe("error");
  });

  it("never needs the exemption list for an account without the other role", async () => {
    db.failing.add("account_role_exemptions");
    expect(await checkMayJoinFirm("u2")).toBe("ok");
  });
});
