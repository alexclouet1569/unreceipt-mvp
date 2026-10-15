import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { periodStartFromSubscription, planFromSubscription } from "@/lib/stripe-plan";

describe("planFromSubscription", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_LIGHT = "price_light";
    process.env.STRIPE_PRICE_REGULAR = "price_regular";
    process.env.STRIPE_PRICE_HEAVY = "price_heavy";
  });
  afterEach(() => {
    delete process.env.STRIPE_PRICE_LIGHT;
    delete process.env.STRIPE_PRICE_REGULAR;
    delete process.env.STRIPE_PRICE_HEAVY;
  });

  it("reads the plan from the subscription's price, skipping the overage price", () => {
    expect(
      planFromSubscription({
        metadata: { plan: "light" },
        items: { data: [{ price: { id: "price_overage" } }, { price: { id: "price_heavy" } }] },
      })
    ).toBe("heavy"); // a plan change in Stripe beats stale checkout metadata
  });

  it("falls back to the plan stamped at checkout", () => {
    expect(
      planFromSubscription({ metadata: { plan: "regular" }, items: { data: [] } })
    ).toBe("regular");
  });

  it("returns null for unknown plans", () => {
    expect(planFromSubscription({ metadata: { plan: "enterprise" } })).toBeNull();
  });
});

describe("periodStartFromSubscription", () => {
  it("converts the first item's period start to ISO", () => {
    expect(
      periodStartFromSubscription({ items: { data: [{ current_period_start: 1_791_000_000 }] } })
    ).toBe(new Date(1_791_000_000 * 1000).toISOString());
    expect(periodStartFromSubscription({})).toBeNull();
  });
});
