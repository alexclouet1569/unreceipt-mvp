// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { conversionDate, crossRate, needsConversion, parseEcbXml, rateOn, round2, roundTo } from "@/lib/fx";
import type { Receipt } from "@/lib/types";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<Cube>
<Cube time="2026-11-04">
<Cube currency="USD" rate="1.0850"/>
<Cube currency="SEK" rate="11.4520"/>
</Cube>
<Cube time="2026-11-03">
<Cube currency="USD" rate="1.0800"/>
<Cube currency="SEK" rate="11.5000"/>
</Cube>
</Cube>
</gesmes:Envelope>`;

describe("fx", () => {
  it("parses the ECB daily reference rates, EUR = 1", () => {
    const days = parseEcbXml(XML);
    expect(days).toEqual([
      { date: "2026-11-04", perEur: { EUR: 1, USD: 1.085, SEK: 11.452 } },
      { date: "2026-11-03", perEur: { EUR: 1, USD: 1.08, SEK: 11.5 } },
    ]);
  });

  it("crosses rates through the euro", () => {
    const perEur = { EUR: 1, USD: 1.085, SEK: 11.452 };
    expect(crossRate(perEur, "EUR", "SEK")).toBe(11.452);
    expect(round2(23.4 * (crossRate(perEur, "EUR", "SEK") as number))).toBe(267.98);
    expect(crossRate(perEur, "USD", "SEK")).toBeCloseTo(10.5548, 4);
    expect(crossRate(perEur, "SEK", "EUR")).toBeCloseTo(1 / 11.452, 8);
    expect(crossRate(perEur, "JPY", "SEK")).toBeNull();
  });

  it("converts on the purchase day, else the receipt date, and never on the upload day", () => {
    expect(conversionDate({ purchased_at: "2026-11-02T12:00:00Z", receipt_date: "2026-11-01" })).toBe("2026-11-02");
    expect(conversionDate({ purchased_at: null, receipt_date: "2026-11-01" })).toBe("2026-11-01");
    expect(conversionDate({ purchased_at: null, receipt_date: null })).toBeNull();
  });

  it("rounds halves the decimal way", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(267.975, 2)).toBe(267.98);
    expect(roundTo(11.452345678, 8)).toBe(11.45234568);
  });

  it("reconverts a stale or inconsistent conversion, keeps a typed bank amount", () => {
    const base = {
      total: 23.4,
      currency: "EUR",
      purchased_at: "2026-11-02T12:00:00Z",
      receipt_date: null,
    } as unknown as Receipt;
    const ecb = { ...base, home_currency: "SEK", home_total: 267.98, fx_rate: 11.452, fx_source: "ecb" } as Receipt;
    expect(needsConversion(ecb, "SEK")).toBe(false);
    // The amount changed after the conversion (e.g. a re-run): convert again.
    expect(needsConversion({ ...ecb, total: 30 } as Receipt, "SEK")).toBe(true);
    // Another company currency: convert again, even a typed amount.
    const manual = { ...ecb, home_total: 270, fx_source: "manual" } as Receipt;
    expect(needsConversion(manual, "SEK")).toBe(false);
    expect(needsConversion(manual, "EUR")).toBe(true);
    // 'same' only fits when the currencies match and the amounts are equal.
    expect(needsConversion({ ...ecb, fx_source: "same" } as Receipt, "SEK")).toBe(true);
    expect(needsConversion({ ...ecb, home_total: null } as Receipt, "SEK")).toBe(true);
    // Nothing to convert without an amount, or a foreign receipt without a date.
    expect(needsConversion({ ...ecb, total: null } as Receipt, "SEK")).toBe(false);
    expect(needsConversion({ ...base, purchased_at: null } as Receipt, "SEK")).toBe(false);
  });

  it("asks the ECB nothing for dates it can't have", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await rateOn("1990-01-01", "EUR", "SEK")).toBeNull();
    expect(await rateOn("2999-01-01", "EUR", "SEK")).toBeNull();
    expect(await rateOn("2026-01-05", "EUR", "XYZ")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("RateTable", () => {
  it("answers like the per-day query: the last rate on or before the day", async () => {
    const { RateTable } = await import("@/lib/fx");
    const t = new RateTable(["SEK"], "2026-10-25", "2026-11-10");
    // Filled as reload() would from fx_rates (ascending dates).
    Object.assign(t as unknown as Record<string, unknown>, {
      rows: new Map([
        [
          "SEK",
          [
            ["2026-10-30", 11.5],
            ["2026-11-02", 11.4],
            ["2026-11-03", 11.45],
          ],
        ],
      ]),
      newest: new Map([["SEK", "2026-11-03"]]),
      loaded: true,
    });
    expect(t.covers("SEK", "2026-11-01")).toBe(true);
    expect(t.covers("USD", "2026-11-01")).toBe(false);
    expect(t.covers("SEK", "2026-11-20")).toBe(false);
    // A Sunday: the Friday before.
    expect(t.lookup("SEK", "2026-11-01")).toEqual({ perEur: 11.5, rateDate: "2026-10-30", coveredUntil: "2026-11-03" });
    expect(t.lookup("SEK", "2026-11-03")?.perEur).toBe(11.45);
    expect(t.lookup("SEK", "2026-10-26")).toBeNull();
  });
});
