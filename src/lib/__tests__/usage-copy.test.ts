import { describe, expect, it } from "vitest";
import { getPlan } from "@/lib/plans";
import { planSuggestion, usageNotice } from "@/lib/usage-copy";

const light = getPlan("light");

describe("usageNotice", () => {
  it("says nothing without a paid plan (pilot)", () => {
    expect(usageNotice({ used: 99, plan: null, extra: 0, overageBilled: false })).toBeNull();
  });

  it("says nothing well inside the allowance", () => {
    expect(usageNotice({ used: 5, plan: light, extra: 0, overageBilled: true })).toBeNull();
  });

  it("warns from 80% of the allowance", () => {
    expect(usageNotice({ used: 12, plan: light, extra: 0, overageBilled: true })).toEqual({
      level: "warn",
      planName: "Light",
      used: 12,
      allowance: 15,
      overagePrice: 0.4,
    });
  });

  it("gives the extra cost once over, when overage is billed", () => {
    expect(usageNotice({ used: 18, plan: light, extra: 3, overageBilled: true })).toMatchObject({
      level: "over",
      extra: 3,
      extraCost: 1.2,
    });
  });

  it("has no cost when overage isn't billed", () => {
    expect(usageNotice({ used: 16, plan: light, extra: 1, overageBilled: false })).toMatchObject({
      level: "over",
      extraCost: null,
    });
  });
});

describe("planSuggestion", () => {
  it("points to the cheaper plan when overage costs more", () => {
    expect(planSuggestion({ used: 45, plan: light, extra: 30, overageBilled: true })).toEqual({
      planName: "Regular",
      used: 45,
      better: 14.99,
      current: 17.99,
    });
  });

  it("stays quiet when the current plan is already the cheapest", () => {
    expect(planSuggestion({ used: 20, plan: light, extra: 5, overageBilled: true })).toBeNull();
  });
});
