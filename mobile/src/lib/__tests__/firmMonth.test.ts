import { describe, expect, it } from "vitest";
import { currentMonth, monthTitle, shiftMonth } from "../firmMonth";

describe("Clients tab months", () => {
  const now = new Date(2026, 10, 15); // 15 November 2026
  it("names the right month (monthLabel counts from 0)", () => {
    expect(currentMonth(now)).toBe("2026-11");
    expect(monthTitle("2026-11", "en", now)).toBe("November");
    expect(monthTitle("2026-01", "sv", now)).toBe("Januari");
    expect(monthTitle("2025-12", "fr", now)).toBe("Décembre 2025");
  });
  it("moves across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
