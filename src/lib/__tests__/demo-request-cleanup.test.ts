import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  table: "",
  column: "",
  cutoff: "",
  result: { data: [{ id: "a" }, { id: "b" }, { id: "c" }], error: null as unknown },
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      calls.table = table;
      return {
        delete: () => ({
          lt: (column: string, cutoff: string) => {
            calls.column = column;
            calls.cutoff = cutoff;
            return { select: async () => calls.result };
          },
        }),
      };
    },
  }),
}));

import { cleanupDemoRequests, DEMO_REQUEST_MAX_AGE_DAYS } from "@/lib/demo-request-cleanup";

describe("cleanupDemoRequests", () => {
  it("deletes requests sent more than 365 days ago, strictly older than the cutoff", async () => {
    expect(DEMO_REQUEST_MAX_AGE_DAYS).toBe(365);
    const result = await cleanupDemoRequests(new Date("2027-11-17T12:00:00Z"));
    expect(calls.table).toBe("demo_requests");
    // `lt`: a row sent exactly at the cutoff is kept, one a moment older goes.
    expect(calls.column).toBe("created_at");
    expect(calls.cutoff).toBe("2026-11-17T12:00:00.000Z");
    expect(result).toEqual({ deleted: 3 });
  });

  it("throws on a database error so the cron run fails", async () => {
    calls.result = { data: null as never, error: { code: "42P01" } };
    await expect(cleanupDemoRequests()).rejects.toThrow("42P01");
  });
});
