// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertResult: { data: null as unknown, error: null as unknown },
  subscription: { data: null as unknown, error: null as unknown },
  count: 0,
  lteArg: null as unknown,
  update: vi.fn(),
  meterCreate: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ billing: { meterEvents: { create: mocks.meterCreate } } }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "subscriptions") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => mocks.subscription,
        };
        return chain;
      }
      // receipt_usage
      const countChain = {
        eq: () => countChain,
        gte: () => countChain,
        lte: async (_col: string, value: unknown) => {
          mocks.lteArg = value;
          return { count: mocks.count, error: null };
        },
      };
      return {
        upsert: () => ({
          select: () => ({ maybeSingle: async () => mocks.upsertResult }),
        }),
        select: () => countChain,
        update: (patch: unknown) => ({
          eq: async (col: string, val: string) => mocks.update(patch, col, val),
        }),
      };
    },
  }),
}));

import { billingPeriod, getUsage, recordReceiptUsage } from "@/lib/usage";

const USER = "11111111-1111-4111-8111-111111111111";
const RECEIPT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-15T10:00:00Z");

const activeRegular = {
  status: "active",
  plan: "regular",
  overage_enabled: true,
  stripe_customer_id: "cus_123",
  current_period_start: "2026-10-03T08:00:00Z",
  current_period_end: "2026-11-03T08:00:00Z",
};

describe("billingPeriod", () => {
  it("uses the subscription's billing period when now is inside it", () => {
    const p = billingPeriod(activeRegular, NOW);
    expect(p.start.toISOString()).toBe("2026-10-03T08:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-03T08:00:00.000Z");
  });

  it("falls back to the calendar month without a subscription (pilot)", () => {
    const p = billingPeriod(null, NOW);
    expect(p.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("falls back to the calendar month when the stored period is stale", () => {
    const p = billingPeriod(
      { current_period_start: "2026-08-03T08:00:00Z", current_period_end: "2026-09-03T08:00:00Z" },
      NOW
    );
    expect(p.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("recordReceiptUsage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.STRIPE_METER_EVENT_NAME = "extra_receipt";
    mocks.upsertResult = { data: { created_at: "2026-10-15T10:00:00Z" }, error: null };
    mocks.subscription = { data: activeRegular, error: null };
    mocks.count = 10;
    mocks.update.mockReset().mockResolvedValue({ error: null });
    mocks.meterCreate.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.STRIPE_METER_EVENT_NAME;
    vi.restoreAllMocks();
  });

  const record = () =>
    recordReceiptUsage({ userId: USER, receiptId: RECEIPT, source: "paper" });

  it("does not bill a receipt inside the allowance", async () => {
    mocks.count = 50; // Regular includes 50

    await record();

    expect(mocks.meterCreate).not.toHaveBeenCalled();
  });

  it("bills a receipt above the allowance once, keyed on the receipt id", async () => {
    mocks.count = 51;

    await record();

    expect(mocks.meterCreate).toHaveBeenCalledWith(
      {
        event_name: "extra_receipt",
        payload: { stripe_customer_id: "cus_123", value: "1" },
        identifier: `receipt_${RECEIPT}`,
      },
      { timeout: 5000, maxNetworkRetries: 1 }
    );
    expect(mocks.update).toHaveBeenCalledWith(
      { overage_billed_at: expect.any(String) },
      "receipt_id",
      RECEIPT
    );
  });

  it("counts up to the receipt's own raw timestamp (microseconds kept)", async () => {
    // Postgres returns microseconds; a Date round-trip would cut them and
    // leave the receipt itself out of its own position → first extra unbilled.
    mocks.upsertResult = { data: { created_at: "2026-10-15T10:00:00.123456+00:00" }, error: null };
    mocks.count = 51;

    await record();

    expect(mocks.lteArg).toBe("2026-10-15T10:00:00.123456+00:00");
    expect(mocks.meterCreate).toHaveBeenCalledTimes(1);
  });

  it("never bills a subscription without the metered extra-receipt price", async () => {
    mocks.subscription = { data: { ...activeRegular, overage_enabled: false }, error: null };
    mocks.count = 60;

    await record();

    expect(mocks.meterCreate).not.toHaveBeenCalled();
  });

  it("stops billing at the per-period safety cap", async () => {
    mocks.count = 50 + 301; // Regular allowance + 301 extras

    await record();

    expect(mocks.meterCreate).not.toHaveBeenCalled();
  });

  it("does nothing more for a receipt that was already recorded", async () => {
    mocks.upsertResult = { data: null, error: null };
    mocks.count = 999;

    await record();

    expect(mocks.meterCreate).not.toHaveBeenCalled();
  });

  it("never bills during the free trial", async () => {
    mocks.subscription = { data: { ...activeRegular, status: "trialing" }, error: null };
    mocks.count = 999;

    await record();

    expect(mocks.meterCreate).not.toHaveBeenCalled();
  });

  it("never bills when overage billing isn't configured", async () => {
    delete process.env.STRIPE_METER_EVENT_NAME;
    mocks.count = 999;

    await record();

    expect(mocks.meterCreate).not.toHaveBeenCalled();
  });

  it("never throws, even when Stripe fails (the receipt is already saved)", async () => {
    mocks.count = 51;
    mocks.meterCreate.mockRejectedValue(new Error("stripe down"));

    await expect(record()).resolves.toBeUndefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("getUsage", () => {
  beforeEach(() => {
    process.env.STRIPE_METER_EVENT_NAME = "extra_receipt";
    mocks.subscription = { data: activeRegular, error: null };
  });

  afterEach(() => {
    delete process.env.STRIPE_METER_EVENT_NAME;
  });

  it("reports usage, plan and extra receipts for the period", async () => {
    mocks.count = 57;

    const u = await getUsage(USER, NOW);

    expect(u.used).toBe(57);
    expect(u.plan?.id).toBe("regular");
    expect(u.extra).toBe(7);
    expect(u.overageBilled).toBe(true);
  });

  it("has no plan and no extra for pilot users without a subscription", async () => {
    mocks.subscription = { data: null, error: null };
    mocks.count = 80;

    const u = await getUsage(USER, NOW);

    expect(u.plan).toBeNull();
    expect(u.extra).toBe(0);
    expect(u.overageBilled).toBe(false);
  });
});
