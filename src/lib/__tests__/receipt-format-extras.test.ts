import { describe, expect, it } from "vitest";
import {
  relativeDayGroup,
  splitFormattedAmount,
} from "../receipt-format";

describe("relativeDayGroup", () => {
  const now = new Date("2026-05-12T10:00:00Z");
  it("returns 'Today' for the same day", () => {
    expect(relativeDayGroup("2026-05-12", now)).toBe("Today");
  });
  it("returns 'Yesterday' for one day ago", () => {
    expect(relativeDayGroup("2026-05-11", now)).toBe("Yesterday");
  });
  it("returns 'This week' for 2–6 days ago", () => {
    expect(relativeDayGroup("2026-05-09", now)).toBe("This week");
    expect(relativeDayGroup("2026-05-06", now)).toBe("This week");
  });
  it("returns 'Earlier in {month}' for 7+ days same year", () => {
    expect(relativeDayGroup("2026-05-01", now)).toBe("Earlier in May");
    expect(relativeDayGroup("2026-04-15", now)).toBe("Earlier in April");
  });
  it("includes year for prior years", () => {
    expect(relativeDayGroup("2025-12-15", now)).toBe("Earlier in December 2025");
  });
  it("returns 'Earlier' for missing/invalid", () => {
    expect(relativeDayGroup(null, now)).toBe("Earlier");
    expect(relativeDayGroup("not-a-date", now)).toBe("Earlier");
  });
});

describe("splitFormattedAmount", () => {
  it("splits suffix-style currencies (kr)", () => {
    expect(splitFormattedAmount(245, "SEK")).toEqual({
      value: "245.00",
      suffix: "kr",
    });
  });
  it("keeps prefix-style currencies attached ($ €)", () => {
    expect(splitFormattedAmount(12.5, "EUR")).toEqual({
      value: "€12.50",
      suffix: "",
    });
    expect(splitFormattedAmount(12.5, "USD")).toEqual({
      value: "$12.50",
      suffix: "",
    });
  });
  it("returns em-dash for null amounts", () => {
    expect(splitFormattedAmount(null, "SEK")).toEqual({
      value: "—",
      suffix: "",
    });
  });
});
