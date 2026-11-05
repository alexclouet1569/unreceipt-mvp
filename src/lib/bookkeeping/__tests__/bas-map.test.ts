import { describe, expect, it } from "vitest";
import { BAS_BY_CATEGORY, basAccountFor, VAT_INPUT_ACCOUNT } from "@/lib/bookkeeping/bas-map";
import { CATEGORY_KEYS } from "@/lib/receipt-format";

describe("bas-map", () => {
  it("has a 4-digit suggestion for every category", () => {
    for (const key of CATEGORY_KEYS) {
      expect(BAS_BY_CATEGORY[key].account).toMatch(/^\d{4}$/);
      expect(BAS_BY_CATEGORY[key].name.length).toBeGreaterThan(0);
    }
    expect(VAT_INPUT_ACCOUNT).toBe("2640");
  });

  it("prefers the firm's own account over the suggestion", () => {
    expect(basAccountFor({ category: "software", bas_account: null })).toEqual({ account: "5420", name: "Programvaror" });
    expect(basAccountFor({ category: "software", bas_account: " 5410 " })).toEqual({ account: "5410", name: "" });
    expect(basAccountFor({ category: "software", bas_account: "" }).account).toBe("5420");
  });
});
