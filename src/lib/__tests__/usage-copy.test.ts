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
    const n = usageNotice({ used: 12, plan: light, extra: 0, overageBilled: true });
    expect(n?.level).toBe("warn");
    expect(n?.message).toContain("12 of the 15");
  });

  it("states the extra cost once over, when overage is billed", () => {
    const n = usageNotice({ used: 18, plan: light, extra: 3, overageBilled: true });
    expect(n?.level).toBe("over");
    expect(n?.message).toContain("3 receipts over");
    expect(n?.message).toContain("€1.20");
  });

  it("doesn't mention a charge when overage isn't billed", () => {
    const n = usageNotice({ used: 16, plan: light, extra: 1, overageBilled: false });
    expect(n?.message).toContain("1 receipt over");
    expect(n?.message).not.toContain("invoice");
  });
});

describe("planSuggestion", () => {
  it("points to the cheaper plan when overage costs more", () => {
    expect(planSuggestion({ used: 45, plan: light, extra: 30, overageBilled: true })).toBe(
      "At 45 receipts, Regular would cost €14.99 instead of €17.99 a month."
    );
  });

  it("stays quiet when the current plan is already the cheapest", () => {
    expect(planSuggestion({ used: 20, plan: light, extra: 5, overageBilled: true })).toBeNull();
  });
});
