import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { billingReturnUrl, summarizeBilling } from "../stripe-billing";

describe("summarizeBilling", () => {
  it("knows nothing about a user without subscriptions", () => {
    expect(summarizeBilling([])).toEqual({
      customerId: null,
      hasLiveSubscription: false,
      hadSubscription: false,
    });
  });

  it.each(["active", "trialing", "past_due"])("treats %s as live", (status) => {
    expect(summarizeBilling([{ stripe_customer_id: "cus_1", status }]).hasLiveSubscription).toBe(true);
  });

  it.each(["canceled", "incomplete", "unpaid"])("treats %s as not live but as a past subscription", (status) => {
    const result = summarizeBilling([{ stripe_customer_id: "cus_1", status }]);
    expect(result.hasLiveSubscription).toBe(false);
    expect(result.hadSubscription).toBe(true);
    expect(result.customerId).toBe("cus_1");
  });

  it("takes the newest row's customer and sees a live older row", () => {
    const result = summarizeBilling([
      { stripe_customer_id: "cus_new", status: "canceled" },
      { stripe_customer_id: "cus_old", status: "active" },
    ]);
    expect(result.customerId).toBe("cus_new");
    expect(result.hasLiveSubscription).toBe(true);
  });

  it("skips empty customer ids", () => {
    expect(
      summarizeBilling([
        { stripe_customer_id: " ", status: "canceled" },
        { stripe_customer_id: "cus_old", status: "canceled" },
      ]).customerId
    ).toBe("cus_old");
  });
});

describe("billingReturnUrl", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("returns to Settings on the product host", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.unreceipt.com/";
    expect(billingReturnUrl()).toBe("https://app.unreceipt.com/app/settings");
  });

  it("falls back to the production product host", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(billingReturnUrl()).toBe("https://app.unreceipt.com/app/settings");
  });
});
