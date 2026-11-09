import { describe, expect, it } from "vitest";
import { dedupeSources, normalizeHeader, parseAmount, parseBankStatement, parseDay } from "../parse-statement";

describe("parseAmount", () => {
  it.each([
    ["-1 234,50", -1234.5],
    ["-1 234,50", -1234.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["−45,00", -45],
    ["45,00-", -45],
    ["(45.00)", -45],
    ["-45,00 kr", -45],
    ["+12,5", 12.5],
    ["812", 812],
    ["1,234", 1234],
    ["0,99", 0.99],
    ["€ 24.19", 24.19],
  ])("%s → %s", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each(["", "abc", "1.2.3,4.5", "Reserverat", "-", "123456789012,00"])("rejects %j", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe("parseDay", () => {
  it.each([
    ["2026-11-03", "2026-11-03"],
    ["2026/11/03", "2026-11-03"],
    ["20261103", "2026-11-03"],
    ["03/11/2026", "2026-11-03"],
    ["03.11.2026", "2026-11-03"],
    ["3-11-26", "2026-11-03"],
    ["2026-11-03 14:22", "2026-11-03"],
  ])("%s → %s", (raw, expected) => {
    expect(parseDay(raw)).toBe(expected);
  });

  it.each(["2026-02-30", "31/04/2026", "Reserverat", "", "11/2026"])("rejects %j", (raw) => {
    expect(parseDay(raw)).toBeNull();
  });
});

describe("normalizeHeader", () => {
  it("drops accents, case and currency suffixes", () => {
    expect(normalizeHeader("Bokföringsdag")).toEqual({ name: "bokforingsdag", currency: null });
    expect(normalizeHeader("Belopp (SEK)")).toEqual({ name: "belopp", currency: "SEK" });
    expect(normalizeHeader("Débit euros")).toEqual({ name: "debit", currency: "EUR" });
    expect(normalizeHeader("Montant (EUROS)")).toEqual({ name: "montant", currency: "EUR" });
    expect(normalizeHeader("Date de l'opération")).toEqual({ name: "date de l'operation", currency: null });
  });
});

describe("parseBankStatement", () => {
  it("reads a Swedbank-style file: preamble line, comma delimiter, quoted cells", () => {
    const csv = [
      "* Transaktioner Period 2026-11-01 – 2026-11-30 Skapad 2026-12-01 08:00",
      "Radnummer,Clearingnummer,Kontonummer,Produkt,Valuta,Bokföringsdag,Transaktionsdag,Valutadag,Referens,Beskrivning,Belopp,Bokfört saldo",
      '1,8327,123456789,Företagskonto,SEK,2026-11-04,2026-11-02,2026-11-04,"CIRCLE K SOLLENTUNA","Kortköp","-812.00","10000.00"',
      '2,8327,123456789,Företagskonto,SEK,2026-11-05,2026-11-05,2026-11-05,"Kund AB","Insättning","5000.00","15000.00"',
    ].join("\r\n");
    const res = parseBankStatement(csv);
    expect(res).toEqual({
      ok: true,
      skipped: 0,
      rows: [
        // The purchase day, not the booking day.
        { bookedOn: "2026-11-02", amount: -812, currency: "SEK", description: "Kortköp · CIRCLE K SOLLENTUNA" },
        { bookedOn: "2026-11-05", amount: 5000, currency: "SEK", description: "Insättning · Kund AB" },
      ],
    });
  });

  it("reads a SEB/Nordea-style file: semicolons, decimal comma, footer and reserved lines skipped", () => {
    const csv = [
      "﻿Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo",
      "2026-11-03;2026-11-03;5484381929;BYGGMAX BARKARBY;-2 486,00;7 514,00",
      "Reserverat;;;ICA NARA;-120,00;",
      "2026-11-07;2026-11-07;5484381930;Månadsavgift;-45,00;7 469,00",
      ";;;;;",
    ].join("\n");
    const res = parseBankStatement(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.skipped).toBe(1);
    expect(res.rows).toEqual([
      { bookedOn: "2026-11-03", amount: -2486, currency: null, description: "BYGGMAX BARKARBY" },
      { bookedOn: "2026-11-07", amount: -45, currency: null, description: "Månadsavgift" },
    ]);
  });

  it("folds French debit/credit columns into a signed amount", () => {
    const csv = [
      "Date;Libellé;Débit euros;Crédit euros",
      "03/11/2026;CB MONOPRIX PARIS 15;24,90;",
      "04/11/2026;VIR CLIENT DUPONT;;1 200,00",
    ].join("\n");
    const res = parseBankStatement(csv);
    expect(res).toEqual({
      ok: true,
      skipped: 0,
      rows: [
        { bookedOn: "2026-11-03", amount: -24.9, currency: "EUR", description: "CB MONOPRIX PARIS 15" },
        { bookedOn: "2026-11-04", amount: 1200, currency: "EUR", description: "VIR CLIENT DUPONT" },
      ],
    });
  });

  it("explains what it looks for when the columns aren't recognised", () => {
    const res = parseBankStatement("Foo;Bar\n1;2\n");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Belopp");
    expect(res.error).toContain("Foo, Bar");
  });

  it("refuses an empty file and a file with columns but no usable line", () => {
    expect(parseBankStatement("  \n")).toEqual({ ok: false, error: "The file is empty." });
    expect(parseBankStatement("Datum;Belopp\nx;y\n").ok).toBe(false);
  });

  it("strips control characters from descriptions", () => {
    const res = parseBankStatement('Datum;Text;Belopp\n2026-11-01;"A\u0007B\n C";-1,00\n');
    expect(res.ok && res.rows[0].description).toBe("A B C");
  });
});

describe("dedupeSources", () => {
  it("numbers identical lines so two coffees on one day stay two lines", () => {
    const row = { bookedOn: "2026-11-01", amount: -35, currency: null, description: "Espresso House" };
    const keys = dedupeSources([row, { ...row }, { ...row, amount: -40 }], "SEK");
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0].endsWith("|0")).toBe(true);
    expect(keys[1].endsWith("|1")).toBe(true);
    // Same file again: same keys.
    expect(dedupeSources([row, { ...row }, { ...row, amount: -40 }], "SEK")).toEqual(keys);
  });
});
