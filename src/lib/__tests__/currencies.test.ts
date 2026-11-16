import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENCY_OPTIONS, HOME_CURRENCY_OPTIONS, formatAmount } from "@/lib/receipt-format";
import { FX_CONVERTED_CURRENCIES, FX_RATE_GAPS } from "@/lib/bookkeeping/rules";

// The app's list, read as text (the app has its own tsconfig).
function appCurrencies(): string[] {
  const text = readFileSync(path.resolve(__dirname, "../../../mobile/src/lib/edits.ts"), "utf8");
  const list = /export const EDITABLE_CURRENCIES = \[([^\]]*)\]/.exec(text)?.[1] ?? "";
  return [...list.matchAll(/"([A-Z]{3})"/g)].map((m) => m[1]);
}

describe("currency lists", () => {
  it("are ISO 4217 codes without duplicates", () => {
    for (const list of [CURRENCY_OPTIONS, HOME_CURRENCY_OPTIONS, FX_CONVERTED_CURRENCIES]) {
      expect(new Set(list).size).toBe(list.length);
      for (const c of list) expect(c).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("only converts currencies a receipt can be in", () => {
    for (const c of FX_CONVERTED_CURRENCIES) expect(CURRENCY_OPTIONS).toContain(c);
  });

  it("lists rate gaps only for converted currencies", () => {
    for (const c of Object.keys(FX_RATE_GAPS)) expect(FX_CONVERTED_CURRENCIES).toContain(c);
  });

  it("offers a company only currencies the ECB still publishes", () => {
    // Without a rate into the company's currency, no foreign receipt
    // could ever be converted. BGN has rates up to 2025 only.
    for (const c of HOME_CURRENCY_OPTIONS) expect(FX_CONVERTED_CURRENCIES).toContain(c);
    expect(HOME_CURRENCY_OPTIONS).not.toContain("BGN");
  });

  it("keeps the iPhone app's copy identical", () => {
    expect(appCurrencies()).toEqual([...CURRENCY_OPTIONS]);
  });

  it("shows the code for currencies without an unambiguous sign", () => {
    expect(formatAmount(1305.5, "NOK")).toBe("1,305.50 NOK");
    expect(formatAmount(49, "PLN")).toBe("49.00 PLN");
    expect(formatAmount(12.5, "EUR")).toBe("€12.50");
  });
});
