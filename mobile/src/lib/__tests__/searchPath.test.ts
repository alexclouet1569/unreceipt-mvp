import { describe, expect, it } from "vitest";
import { searchPath } from "../searchPath";

describe("searchPath", () => {
  it("sends the text, a month or a year, and the cursor", () => {
    expect(searchPath(" ica ", "", null)).toBe("/api/mobile/receipts?q=ica");
    expect(searchPath("", "2026-11", null)).toBe("/api/mobile/receipts?month=2026-11");
    expect(searchPath("49,50", "2026", null)).toBe("/api/mobile/receipts?q=49%2C50&year=2026");
    expect(searchPath("ica", "", "|2026-11-02T12:00:00Z|abc")).toBe(
      "/api/mobile/receipts?q=ica&after=%7C2026-11-02T12%3A00%3A00Z%7Cabc",
    );
  });

  it("drops a period that is neither a month nor a year", () => {
    expect(searchPath("ica", "all", null)).toBe("/api/mobile/receipts?q=ica");
  });
});
