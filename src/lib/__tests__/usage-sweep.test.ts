// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  subs: [] as unknown[],
  usage: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ patch: unknown; id: string }>,
  meterCreate: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: state.captureMessage,
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ billing: { meterEvents: { create: state.meterCreate } } }),
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "subscriptions") {
        const c = {
          select: () => c,
          eq: () => c,
          order: async () => ({ data: state.subs, error: null }),
        };
        return c;
      }
      const c = {
        select: () => c,
        eq: () => c,
        gte: () => c,
        lte: () => c,
        order: () => c,
        limit: async () => ({ data: state.usage, error: null }),
        update: (patch: unknown) => ({
          eq: (_col: string, id: string) => {
            const p = Promise.resolve().then(() => {
              state.updates.push({ patch, id });
              return { error: null };
            });
            return Object.assign(p, { is: () => p });
          },
        }),
      };
      return c;
    },
  }),
}));

import { sweepUnbilledOverage } from "@/lib/usage";

const NOW = new Date("2026-10-15T04:45:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const lightSub = {
  user_id: "u1",
  status: "active",
  plan: "light", // 15 receipts
  overage_enabled: true,
  stripe_customer_id: "cus_1",
  current_period_start: "2026-10-03T08:00:00Z",
  current_period_end: "2026-11-03T08:00:00Z",
  created_at: "2026-09-03T08:00:00Z",
};

const usageRow = (i: number, o: Record<string, unknown> = {}) => ({
  receipt_id: `r${i}`,
  created_at: `2026-10-${String(4 + Math.floor(i / 2)).padStart(2, "0")}T10:00:00Z`,
  overage_billed_at: null,
  overage_attempted_at: null,
  ...o,
});

beforeEach(() => {
  process.env.STRIPE_METER_EVENT_NAME = "extra_receipt";
  state.subs = [lightSub];
  state.updates = [];
  state.meterCreate.mockReset().mockResolvedValue({});
  state.captureMessage.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.STRIPE_METER_EVENT_NAME;
  vi.restoreAllMocks();
});

describe("sweepUnbilledOverage", () => {
  it("does nothing without a configured meter", async () => {
    delete process.env.STRIPE_METER_EVENT_NAME;
    expect(await sweepUnbilledOverage(NOW)).toEqual({
      subscriptions: 0,
      reported: 0,
      failed: 0,
      ambiguous: 0,
    });
  });

  it("reports only unbilled receipts above the allowance, with their own timestamp", async () => {
    state.usage = [
      ...Array.from({ length: 15 }, (_, i) => usageRow(i)), // inside allowance
      usageRow(15, { overage_billed_at: hoursAgo(30) }), // already billed
      usageRow(16), // never attempted
      usageRow(17, { overage_attempted_at: hoursAgo(3) }), // failed earlier today
    ];

    const res = await sweepUnbilledOverage(NOW);

    expect(res).toMatchObject({ reported: 2, ambiguous: 0, failed: 0 });
    const ids = state.meterCreate.mock.calls.map((c) => c[0].identifier);
    expect(ids).toEqual(["receipt_r16", "receipt_r17"]);
    expect(state.meterCreate.mock.calls[0][0].timestamp).toBe(
      Date.parse(usageRow(16).created_at) / 1000,
    );
  });

  it("leaves attempts older than the dedupe window for a person to check", async () => {
    state.usage = [
      ...Array.from({ length: 15 }, (_, i) => usageRow(i)),
      usageRow(15, { overage_attempted_at: hoursAgo(30) }),
    ];

    const res = await sweepUnbilledOverage(NOW);

    expect(res.ambiguous).toBe(1);
    expect(state.meterCreate).not.toHaveBeenCalled();
    expect(state.captureMessage).toHaveBeenCalled();
  });

  it("counts a Stripe failure and keeps going", async () => {
    state.usage = [
      ...Array.from({ length: 15 }, (_, i) => usageRow(i)),
      usageRow(15),
      usageRow(16),
    ];
    state.meterCreate.mockRejectedValueOnce(new Error("down"));

    const res = await sweepUnbilledOverage(NOW);
    expect(res).toMatchObject({ reported: 1, failed: 1 });
  });
});
