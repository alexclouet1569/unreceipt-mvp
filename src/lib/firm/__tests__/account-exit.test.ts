// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyFirmExit,
  firmExitNotice,
  planFirmExit,
  type FirmExitPlan,
} from "../account-exit";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

// Just enough of the query builder for account-exit.ts: filters, a head
// count, maybeSingle, update and delete (with the firms → members/clients
// cascade the schema has).
function fakeSupabase(db: Db, failOn: string | null = null) {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    let head = false;
    const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      const error = failOn === `${mode}:${table}` ? { message: "boom" } : null;
      if (error) return { data: null, count: null, error };
      if (mode === "delete") {
        const gone = new Set(rows());
        db[table] = (db[table] ?? []).filter((r) => !gone.has(r));
        if (table === "firms") {
          const ids = new Set([...gone].map((r) => r.id));
          for (const child of ["firm_members", "firm_clients"]) {
            db[child] = (db[child] ?? []).filter((r) => !ids.has(r.firm_id));
          }
        }
        return { data: null, error: null };
      }
      if (mode === "update") {
        const hit = rows();
        for (const r of hit) Object.assign(r, patch);
        return { data: hit, error: null };
      }
      const found = rows();
      return { data: head ? null : found, count: found.length, error: null };
    };
    const q = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return q;
      },
      delete: () => {
        mode = "delete";
        return q;
      },
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return q;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        return q;
      },
      not: (col: string) => {
        filters.push((r) => r[col] !== null && r[col] !== undefined);
        return q;
      },
      maybeSingle: async () => {
        const res = run();
        return { data: res.data?.[0] ?? null, error: res.error };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const ME = "11111111-1111-4111-8111-111111111111";
const FIRM = "f0000000-0000-4000-8000-000000000001";

function member(id: string, userId: string | null, role: "admin" | "staff", claimedAt: string | null) {
  return {
    id,
    firm_id: FIRM,
    user_id: userId,
    email: `${id}@firm.se`,
    role,
    claimed_at: claimedAt,
    created_at: "2026-11-01T08:00:00Z",
  };
}

function baseDb(members: Row[], activeClients = 2): Db {
  return {
    firms: [{ id: FIRM, name: "Bokföring AB" }],
    firm_members: members,
    firm_clients: [
      ...Array.from({ length: activeClients }, (_, i) => ({ id: `c${i}`, firm_id: FIRM, status: "active" })),
      { id: "c-invited", firm_id: FIRM, status: "invited" },
    ],
  };
}

describe("planFirmExit", () => {
  it("is none for someone who isn't in a firm", async () => {
    const db = baseDb([member("other", "u-other", "admin", "2026-11-01T09:00:00Z")]);
    expect(await planFirmExit(fakeSupabase(db), ME)).toEqual({ kind: "none" });
  });

  it("closes the firm when nobody else has signed in to it (pending invites don't count)", async () => {
    const db = baseDb([
      member("me", ME, "admin", "2026-11-01T09:00:00Z"),
      member("pending", null, "staff", null),
    ]);
    expect(await planFirmExit(fakeSupabase(db), ME)).toEqual({
      kind: "close",
      firmId: FIRM,
      firmName: "Bokföring AB",
      activeClients: 2,
    });
  });

  it("hands the admin role to the colleague who joined first when the only admin leaves", async () => {
    const db = baseDb([
      member("me", ME, "admin", "2026-11-01T09:00:00Z"),
      member("late", "u-late", "staff", "2026-11-03T09:00:00Z"),
      member("early", "u-early", "staff", "2026-11-02T09:00:00Z"),
    ]);
    expect(await planFirmExit(fakeSupabase(db), ME)).toEqual({
      kind: "handover",
      firmId: FIRM,
      firmName: "Bokföring AB",
      successorMemberId: "early",
      successorEmail: "early@firm.se",
    });
  });

  it("leaves the firm alone when another admin remains, or a staff member leaves", async () => {
    const twoAdmins = baseDb([
      member("me", ME, "admin", "2026-11-01T09:00:00Z"),
      member("boss", "u-boss", "admin", "2026-11-02T09:00:00Z"),
    ]);
    expect((await planFirmExit(fakeSupabase(twoAdmins), ME)).kind).toBe("stays");

    const staffLeaves = baseDb([
      member("boss", "u-boss", "admin", "2026-11-01T09:00:00Z"),
      member("me", ME, "staff", "2026-11-02T09:00:00Z"),
    ]);
    expect((await planFirmExit(fakeSupabase(staffLeaves), ME)).kind).toBe("stays");
  });

  it("fails loudly instead of guessing when a lookup errors", async () => {
    const db = baseDb([member("me", ME, "admin", "2026-11-01T09:00:00Z")]);
    await expect(planFirmExit(fakeSupabase(db, "select:firm_clients"), ME)).rejects.toThrow();
  });
});

describe("applyFirmExit", () => {
  it("close deletes the firm with its members, invites and client links, and touches no other firm", async () => {
    const db = baseDb([member("me", ME, "admin", "2026-11-01T09:00:00Z"), member("pending", null, "staff", null)]);
    db.firms.push({ id: "other-firm", name: "Other" });
    db.firm_clients.push({ id: "other-client", firm_id: "other-firm", status: "active" });
    const supabase = fakeSupabase(db);

    await applyFirmExit(supabase, await planFirmExit(supabase, ME));

    expect(db.firms.map((f) => f.id)).toEqual(["other-firm"]);
    expect(db.firm_members).toEqual([]);
    expect(db.firm_clients.map((c) => c.id)).toEqual(["other-client"]);
    // A retry after a later failure finds nothing left to do.
    expect(await planFirmExit(supabase, ME)).toEqual({ kind: "none" });
  });

  it("handover promotes only the successor, and a retry then reads stays", async () => {
    const db = baseDb([
      member("me", ME, "admin", "2026-11-01T09:00:00Z"),
      member("early", "u-early", "staff", "2026-11-02T09:00:00Z"),
      member("late", "u-late", "staff", "2026-11-03T09:00:00Z"),
    ]);
    const supabase = fakeSupabase(db);

    await applyFirmExit(supabase, await planFirmExit(supabase, ME));

    const roles = Object.fromEntries(db.firm_members.map((m) => [m.id, m.role]));
    expect(roles).toEqual({ me: "admin", early: "admin", late: "staff" });
    expect((await planFirmExit(supabase, ME)).kind).toBe("stays");
  });

  it("handover stops when the successor left after the plan was read", async () => {
    const db = baseDb([
      member("me", ME, "admin", "2026-11-01T09:00:00Z"),
      member("early", "u-early", "staff", "2026-11-02T09:00:00Z"),
    ]);
    const supabase = fakeSupabase(db);
    const plan = await planFirmExit(supabase, ME);
    db.firm_members = db.firm_members.filter((m) => m.id !== "early");

    await expect(applyFirmExit(supabase, plan)).rejects.toThrow(/no successor/);
  });

  it("throws when the write fails", async () => {
    const db = baseDb([member("me", ME, "admin", "2026-11-01T09:00:00Z")]);
    const supabase = fakeSupabase(db, "delete:firms");
    await expect(applyFirmExit(supabase, await planFirmExit(supabase, ME))).rejects.toThrow();
    expect(db.firms).toHaveLength(1);
  });
});

describe("firmExitNotice", () => {
  const base = { firmId: FIRM, firmName: "Bokföring AB" };
  it("says what happens to the firm in each case", () => {
    expect(firmExitNotice({ kind: "none" })).toBeNull();
    expect(firmExitNotice({ kind: "stays", ...base })).toContain("You'll leave Bokföring AB");
    expect(
      firmExitNotice({ kind: "handover", ...base, successorMemberId: "x", successorEmail: "anna@firm.se" }),
    ).toContain("anna@firm.se becomes admin");
    const plans: FirmExitPlan[] = [
      { kind: "close", ...base, activeClients: 0 },
      { kind: "close", ...base, activeClients: 1 },
      { kind: "close", ...base, activeClients: 3 },
    ];
    expect(plans.map(firmExitNotice)).toEqual([
      "You're the only person in Bokföring AB, so deleting your account also closes the firm. Nothing else is affected: the firm has no linked clients.",
      "You're the only person in Bokföring AB, so deleting your account also closes the firm. Its link with 1 client ends. Their receipts stay in their own accounts.",
      "You're the only person in Bokföring AB, so deleting your account also closes the firm. Its link with 3 clients ends. Their receipts stay in their own accounts.",
    ]);
  });
});
