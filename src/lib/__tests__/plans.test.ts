import { describe, expect, it } from "vitest";
import {
  OVERAGE_PRICE,
  PLANS,
  cheapestPlanFor,
  getPlan,
  monthlyCost,
  planForReceipts,
} from "@/lib/plans";

describe("plans", () => {
  it("gets cheaper per receipt as plans get bigger", () => {
    const perReceipt = PLANS.map((p) => p.price / p.receipts);
    expect(perReceipt[0]).toBeGreaterThan(perReceipt[1]);
    expect(perReceipt[1]).toBeGreaterThan(perReceipt[2]);
  });

  it("prices overage above every plan's own per-receipt price", () => {
    for (const p of PLANS) {
      expect(OVERAGE_PRICE).toBeGreaterThanOrEqual(p.price / p.receipts);
    }
  });

  it("charges the base price within the allowance and overage above it", () => {
    const light = getPlan("light");
    expect(monthlyCost(light, 15)).toBe(5.99);
    expect(monthlyCost(light, 20)).toBe(7.99);
  });

  it("recommends upgrading once overage makes the next plan cheaper", () => {
    // Light + overage beats Regular until ~37 receipts; Regular + overage
    // beats Heavy until ~87.
    expect(cheapestPlanFor(10).id).toBe("light");
    expect(cheapestPlanFor(37).id).toBe("light");
    expect(cheapestPlanFor(38).id).toBe("regular");
    expect(cheapestPlanFor(87).id).toBe("regular");
    expect(cheapestPlanFor(88).id).toBe("heavy");
  });

  it("planForReceipts picks the smallest plan that covers the volume", () => {
    expect(planForReceipts(15).id).toBe("light");
    expect(planForReceipts(16).id).toBe("regular");
    expect(planForReceipts(500).id).toBe("heavy");
  });
});
