import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ table: "", cutoff: "", result: { data: [{ user_id: "a" }, { user_id: "b" }], error: null as unknown } }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      calls.table = table;
      return {
        delete: () => ({
          lt: (_col: string, cutoff: string) => {
            calls.cutoff = cutoff;
            return { select: async () => calls.result };
          },
        }),
      };
    },
  }),
}));

import { cleanupForwardingConfirmations } from "@/lib/forwarding-confirmation-cleanup";

describe("cleanupForwardingConfirmations", () => {
  it("deletes codes received more than 7 days ago", async () => {
    const result = await cleanupForwardingConfirmations(new Date("2026-10-16T12:00:00Z"));
    expect(calls.table).toBe("email_forwarding_confirmations");
    expect(calls.cutoff).toBe("2026-10-09T12:00:00.000Z");
    expect(result).toEqual({ deleted: 2 });
  });

  it("throws on a database error so the cron reports it", async () => {
    calls.result = { data: null as never, error: { code: "42P01" } };
    await expect(cleanupForwardingConfirmations()).rejects.toThrow("42P01");
  });
});
