import { describe, expect, it } from "vitest";
import { paymentsReadiness } from "@/lib/payments-readiness";

const complete = {
  STRIPE_SECRET_KEY: "sk_live_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_LIGHT: "price_l",
  STRIPE_PRICE_REGULAR: "price_r",
  STRIPE_PRICE_HEAVY: "price_h",
  STRIPE_PRICE_OVERAGE: "price_o",
  STRIPE_METER_EVENT_NAME: "extra_receipt",
} as unknown as NodeJS.ProcessEnv;

describe("paymentsReadiness", () => {
  it("is ready when every payment setting is present with a live key", () => {
    expect(paymentsReadiness(complete).ready).toBe(true);
  });

  it("is not ready on a test key", () => {
    const r = paymentsReadiness({ ...complete, STRIPE_SECRET_KEY: "sk_test_abc" });
    expect(r.ready).toBe(false);
    expect(r.checks.find((c) => !c.ok)?.label).toMatch(/live key/);
  });

  it("lists every missing setting", () => {
    const r = paymentsReadiness({} as NodeJS.ProcessEnv);
    expect(r.ready).toBe(false);
    expect(r.checks.filter((c) => !c.ok)).toHaveLength(7);
    expect(r.manual.length).toBeGreaterThan(0);
  });
});
