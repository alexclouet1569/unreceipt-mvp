// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/types";

// Every save ensureHomeAmounts() makes, with its filters.
const m = vi.hoisted(() => ({
  saves: [] as Array<{ fields: Record<string, unknown>; filters: Array<[string, string, unknown]> }>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        const filters: Array<[string, string, unknown]> = [];
        const chain = {
          eq: (col: string, val: unknown) => (filters.push(["eq", col, val]), chain),
          is: (col: string, val: unknown) => (filters.push(["is", col, val]), chain),
          then: (resolve: (r: { error: null }) => void) => {
            m.saves.push({ fields, filters });
            resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  }),
}));

import { ensureHomeAmounts } from "@/lib/fx";

// An outlay in kronor, while the company was in euros: after the company
// switches to SEK, its home amount needs converting (same currency, so no
// ECB rate is fetched).
function outlay(over: Partial<Receipt>): Receipt {
  return {
    id: "r1",
    total: 420,
    currency: "SEK",
    purchased_at: "2026-11-03T12:00:00+00:00",
    receipt_date: "2026-11-03",
    home_currency: "EUR",
    home_total: 36.5,
    fx_rate: 0.0869,
    fx_date: "2026-11-03",
    fx_source: "ecb",
    approval_status: "approved",
    paid_by: "employee",
    reimbursed_at: null,
    ...over,
  } as Receipt;
}

beforeEach(() => {
  m.saves.length = 0;
});

describe("ensureHomeAmounts and outlays already paid back", () => {
  it("never replaces the home amount an outlay was paid back in", async () => {
    const paid = outlay({ reimbursed_at: "2026-11-10T09:00:00+00:00" });
    const [out] = await ensureHomeAmounts([paid], "SEK");
    expect(out.home_total).toBe(36.5);
    expect(out.home_currency).toBe("EUR");
    expect(m.saves).toHaveLength(0);
  });

  it("still makes the first conversion of one never converted", async () => {
    const paid = outlay({ reimbursed_at: "2026-11-10T09:00:00+00:00", home_total: null, home_currency: null, fx_source: null });
    const [out] = await ensureHomeAmounts([paid], "SEK");
    expect(out.home_total).toBe(420);
    expect(m.saves).toHaveLength(1);
    expect(m.saves[0].filters).toContainEqual(["is", "home_total", null]);
  });

  it("converts one not paid back yet, unless a payment lands before the save", async () => {
    const owed = outlay({});
    const [out] = await ensureHomeAmounts([owed], "SEK");
    expect(out.home_total).toBe(420);
    expect(out.home_currency).toBe("SEK");
    expect(m.saves).toHaveLength(1);
    expect(m.saves[0].filters).toContainEqual(["eq", "home_total", 36.5]);
    // Checked at the database too: a caller may not have read reimbursed_at.
    expect(m.saves[0].filters).toContainEqual(["is", "reimbursed_at", null]);
  });
});
