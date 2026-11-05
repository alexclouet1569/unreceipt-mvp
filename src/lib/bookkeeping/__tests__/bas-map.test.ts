import { describe, expect, it } from "vitest";
import { BAS_BY_CATEGORY, basAccountFor, VAT_INPUT_ACCOUNT } from "@/lib/bookkeeping/bas-map";
import { CATEGORY_KEYS } from "@/lib/receipt-format";

describe("bas-map", () => {
  it("has a 4-digit suggestion with a name for every category", () => {
    for (const key of CATEGORY_KEYS) {
      expect(BAS_BY_CATEGORY[key].account).toMatch(/^\d{4}$/);
      expect(BAS_BY_CATEGORY[key].name.length).toBeGreaterThan(0);
    }
    expect(VAT_INPUT_ACCOUNT).toBe("2640");
  });

  it("never suggests a deductible account where deductibility is unknown", () => {
    // Representation: non-deductible account, VAT not treated as input VAT.
    expect(BAS_BY_CATEGORY.client_entertainment).toEqual({
      account: "6072",
      name: "Representation, ej avdragsgill",
      inputVatDeductible: false,
    });
    // Unknown purchases go to the group account, not an "avdragsgill" one.
    expect(BAS_BY_CATEGORY.other.account).toBe("6990");
    expect(BAS_BY_CATEGORY.other.name).not.toMatch(/avdragsgill/);
  });

  it("prefers the firm's own account over the suggestion, keeping the VAT rule", () => {
    expect(basAccountFor({ category: "software", bas_account: null })).toEqual({ account: "5420", name: "Programvaror", inputVatDeductible: true });
    expect(basAccountFor({ category: "software", bas_account: " 5410 " })).toEqual({ account: "5410", name: "", inputVatDeductible: true });
    expect(basAccountFor({ category: "client_entertainment", bas_account: "6071" }).inputVatDeductible).toBe(false);
    expect(basAccountFor({ category: "software", bas_account: "" }).account).toBe("5420");
  });
});
