import { describe, expect, it } from "vitest";
import { CURRENCY_TOKEN, currencyAround } from "@/lib/receipts/templates/amount";

// The token after an amount, as the Stripe and Uber templates read it.
const after = (line: string) =>
  new RegExp(String.raw`\d[\d.,]*[ \t]*(${CURRENCY_TOKEN})?`, "i").exec(line)?.[1];

describe("currency next to a template amount", () => {
  it("reads the European codes the app now handles", () => {
    expect(currencyAround(undefined, "DKK", "")).toBe("DKK");
    expect(currencyAround(undefined, "PLN", "")).toBe("PLN");
    expect(currencyAround("CZK", undefined, "")).toBe("CZK");
  });

  it("never reads the words ALL or TRY after an amount as a currency", () => {
    expect(currencyAround(undefined, after("TOTAL 49.00 ALL TAXES INCLUDED"), "")).toBeUndefined();
    expect(currencyAround(undefined, after("TOTAL 120,00 TRY AGAIN"), "")).toBeUndefined();
    // Part of a longer word: not a token at all.
    expect(after("TOTAL 120,00 ALLOWANCE")).toBeUndefined();
    // Before the amount they are the currency.
    expect(currencyAround("TRY", undefined, "")).toBe("TRY");
  });

  it("ignores codes we don't handle", () => {
    expect(currencyAround(undefined, "JPY", "")).toBeUndefined();
  });
});
