import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage, resolveLocale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { formatAmount, relativeDayGroup, splitFormattedAmount } from "@/lib/receipt-format";
import { claimMonthLabel, claimTypeLabel } from "@/lib/claims/claim";

describe("locale", () => {
  it("picks the best supported language from Accept-Language", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(localeFromAcceptLanguage("de-DE,sv;q=0.7,en;q=0.5")).toBe("sv");
    expect(localeFromAcceptLanguage("en;q=0.4,fr;q=0.8")).toBe("fr");
    expect(localeFromAcceptLanguage("nb-NO")).toBe("sv");
    expect(localeFromAcceptLanguage("de-DE")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("lets a saved choice win over the browser", () => {
    expect(resolveLocale("sv", "fr-FR")).toBe("sv");
    expect(resolveLocale("xx", "fr-FR")).toBe("fr");
  });
});

describe("localized formatting", () => {
  it("writes amounts the local way", () => {
    expect(formatAmount(21.5, "EUR")).toBe("€21.50");
    expect(formatAmount(21.5, "EUR", "fr")).toBe("21,50 €");
    expect(formatAmount(1245, "SEK", "sv")).toBe("1 245,00 kr");
    expect(splitFormattedAmount(21.5, "EUR", "fr")).toEqual({ value: "21,50", suffix: "€" });
  });

  it("translates day groups, months and claim types", () => {
    const now = new Date("2026-05-12T12:00:00");
    expect(relativeDayGroup("2026-05-11", now, "fr")).toBe("Hier");
    expect(relativeDayGroup("2026-04-15", now, "sv")).toBe("Tidigare i april");
    expect(claimMonthLabel("2026-05", "fr")).toBe("Mai 2026");
    expect(claimTypeLabel("dinner", "sv")).toBe("Middag");
  });

  it("has the same keys in every language", () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v).map((s) => `${k}.${s}`) : [k],
      );
    const en = keys(getMessages("en")).sort();
    expect(keys(getMessages("fr")).sort()).toEqual(en);
    expect(keys(getMessages("sv")).sort()).toEqual(en);
  });
});
