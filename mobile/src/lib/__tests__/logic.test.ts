import { describe, expect, it } from "vitest";
import type { MobileReceipt } from "@/lib/mobile/types";
import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";
import { sv } from "../../i18n/sv";
import { fill, joinList, pickLocale, stringsFor } from "../../i18n/core";
import { dayGroup, formatMoney, monthLabel, moneyParts, parseReceiptDate } from "../format";
import { buildSections } from "../sections";

const NBSP = /[  ]/g;
const plain = (s: string) => s.replace(NBSP, " ");

describe("languages", () => {
  it("follows the phone's first language the app speaks", () => {
    expect(pickLocale(["sv-SE", "en"])).toBe("sv");
    expect(pickLocale(["fr"])).toBe("fr");
    expect(pickLocale(["de", "fr-CA"])).toBe("fr");
    expect(pickLocale(["nb"])).toBe("sv");
    expect(pickLocale(["ja", null])).toBe("en");
    expect(pickLocale([])).toBe("en");
  });

  it("has every string, non-empty, in Swedish and French", () => {
    const walk = (ref: object, other: object, path: string) => {
      for (const [key, value] of Object.entries(ref)) {
        const o = (other as Record<string, unknown>)[key];
        if (typeof value === "string") {
          expect(typeof o, `${path}.${key}`).toBe("string");
          expect((o as string).trim(), `${path}.${key}`).not.toBe("");
          // Same placeholders, so no {name} is left unfilled.
          const holes = (t: string) => (t.match(/\{\w+\}/g) ?? []).sort().join();
          expect(holes(o as string), `${path}.${key}`).toBe(holes(value));
        } else {
          walk(value, o as object, `${path}.${key}`);
        }
      }
    };
    walk(en, sv, "sv");
    walk(en, fr, "fr");
  });

  it("fills placeholders and joins lists", () => {
    expect(fill(en.receipts.missing, { fields: "amount" })).toBe("Missing amount");
    expect(fill("{a} {b}", { a: 1 })).toBe("1 {b}");
    expect(joinList(["merchant", "amount", "date"], "and")).toBe("merchant, amount and date");
    expect(joinList(["belopp"], "och")).toBe("belopp");
    expect(stringsFor("fr").tabs.receipts).toBe("Reçus");
  });
});

describe("amounts", () => {
  it("writes amounts the way each language does", () => {
    expect(formatMoney(245, "SEK", "en")).toBe("245.00 kr");
    expect(formatMoney(1305.5, "SEK", "en")).toBe("1,305.50 kr");
    expect(plain(formatMoney(1305.5, "SEK", "sv"))).toBe("1 305,50 kr");
    expect(formatMoney(12.5, "EUR", "en")).toBe("€12.50");
    expect(plain(formatMoney(12.5, "EUR", "fr"))).toBe("12,50 €");
    expect(plain(formatMoney(12.5, "EUR", "sv"))).toBe("12,50 €");
    expect(formatMoney(3, "CHF", "en")).toBe("3.00 CHF");
  });

  it("splits the currency off so it can be set smaller", () => {
    expect(moneyParts(245, "SEK", "en")).toEqual({ value: "245.00", prefix: "", suffix: "kr" });
    expect(moneyParts(9.99, "USD", "en")).toEqual({ value: "9.99", prefix: "$", suffix: "" });
  });
});

describe("dates", () => {
  const now = new Date(2026, 10, 9, 15, 0); // Monday 9 Nov 2026, local time

  it("reads a plain date as that local day", () => {
    const d = parseReceiptDate("2026-11-08");
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate()]).toEqual([2026, 10, 8]);
    expect(parseReceiptDate(null)).toBeNull();
    expect(parseReceiptDate("not a date")).toBeNull();
  });

  it("groups by day, week and month", () => {
    expect(dayGroup(new Date(2026, 10, 9, 8), now)).toEqual({ kind: "today" });
    expect(dayGroup(new Date(2026, 10, 8, 23), now)).toEqual({ kind: "yesterday" });
    expect(dayGroup(new Date(2026, 10, 4), now)).toEqual({ kind: "thisWeek" });
    expect(dayGroup(new Date(2026, 9, 30), now)).toEqual({ kind: "month", year: 2026, month: 9 });
    expect(dayGroup(null, now)).toEqual({ kind: "noDate" });
  });

  it("names months in each language, with the year only when it differs", () => {
    expect(monthLabel(2026, 9, "en", now)).toBe("October");
    expect(monthLabel(2026, 9, "sv", now)).toBe("Oktober");
    expect(monthLabel(2025, 11, "fr", now)).toBe("Décembre 2025");
  });
});

describe("receipt sections", () => {
  const now = new Date(2026, 10, 9, 15, 0);
  const r = (id: string, over: Partial<MobileReceipt>): MobileReceipt => ({
    id,
    status: "verified",
    missing: [],
    source: "email",
    merchant: "ICA",
    category: "meals",
    currency: "SEK",
    total: 10,
    homeCurrency: "SEK",
    homeTotal: 10,
    fxSource: "same",
    date: "2026-11-09",
    createdAt: "2026-11-09T10:00:00Z",
    original: null,
    notes: null,
    possibleDuplicate: false,
    exportedAt: null,
    bookedAt: null,
    ...over,
  });

  it("puts what needs the user first, then the rest by day, undated last", () => {
    const sections = buildSections(
      [
        r("a", {}),
        r("b", { status: "pending_review", missing: ["total"], date: "2026-10-01" }),
        r("c", { date: null }),
        r("d", { date: "2026-11-08" }),
        r("e", { date: "2026-10-30" }),
        r("f", { date: "2026-10-02" }),
      ],
      en,
      "en",
      now,
    );
    expect(sections.map((s) => [s.title, s.data.map((x) => x.id).join("")])).toEqual([
      ["To confirm", "b"],
      ["Today", "a"],
      ["Yesterday", "d"],
      ["October", "ef"],
      ["No date yet", "c"],
    ]);
    expect(sections[0].attention).toBe(true);
    expect(sections[1].attention).toBe(false);
  });

  it("has no sections without receipts", () => {
    expect(buildSections([], en, "en", now)).toEqual([]);
  });
});
