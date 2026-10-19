import { describe, expect, it } from "vitest";
import {
  StatementParseError,
  decodeStatementFile,
  parseAmount,
  parseDate,
  parseStatement,
  splitCsv,
} from "../parse-statement";

describe("parseAmount", () => {
  it.each([
    ["-245,00", -245],
    ["-1 234,50", -1234.5],
    ["−1 234,50", -1234.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["-245.00", -245],
    ["245,00-", -245],
    ["12 000", 12000],
    ["1.234", 1234],
    ["+99,9", 99.9],
    ["612,00 kr", 612],
  ])("%s → %s", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each(["", "abc", "12,3,4,5", "--5"])("rejects %j", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-09-03", "2026-09-03"],
    ["2026/09/03", "2026-09-03"],
    ["20260903", "2026-09-03"],
    ["26-09-03", "2026-09-03"],
    ["03.09.2026", "2026-09-03"],
    ["2026-09-03 14:22", "2026-09-03"],
  ])("%s → %s", (raw, expected) => {
    expect(parseDate(raw)).toBe(expected);
  });

  it.each(["2026-02-30", "Summa", "", "09/2026"])("rejects %j", (raw) => {
    expect(parseDate(raw)).toBeNull();
  });
});

describe("splitCsv", () => {
  it("stays linear on a field full of stray quotes", () => {
    const start = Date.now();
    splitCsv("a" + '"'.repeat(200_000), ";");
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("handles quotes, escaped quotes and quoted newlines", () => {
    expect(splitCsv('a;"b;c";"say ""hi"""\r\n"multi\nline";2\n', ";")).toEqual([
      ["a", "b;c", 'say "hi"'],
      ["multi\nline", "2"],
    ]);
  });
});

describe("decodeStatementFile", () => {
  it("reads UTF-8", () => {
    expect(decodeStatementFile(new TextEncoder().encode("Bokföringsdag"))).toBe("Bokföringsdag");
  });

  it("falls back to Windows-1252 so å/ä/ö headers still match", () => {
    // "Bokföringsdag;Belopp" with ö as the single byte 0xF6.
    const bytes = Uint8Array.from([..."Bokf"].map((c) => c.charCodeAt(0)).concat(0xf6, ..."ringsdag".split("").map((c) => c.charCodeAt(0))));
    expect(decodeStatementFile(bytes)).toBe("Bokföringsdag");
  });
});

describe("parseStatement", () => {
  it("reads a semicolon export with a title row above the header", () => {
    const csv = [
      "Kontoutdrag;Företagskonto 1234-5678;;",
      "Bokföringsdag;Transaktionsdag;Text;Belopp;Saldo",
      "2026-09-04;2026-09-03;KORTKÖP 260903 CIRCLE K MALMO;-612,00;10 388,00",
      "2026-09-05;2026-09-05;Inbetalning faktura 1042;12 500,00;22 888,00",
      ";;;;",
    ].join("\n");

    const parsed = parseStatement(csv);

    expect(parsed.columns).toEqual({ date: "Transaktionsdag", text: "Text", amount: "Belopp" });
    expect(parsed.lines).toEqual([
      { id: "L1", date: "2026-09-03", text: "KORTKÖP 260903 CIRCLE K MALMO", amount: -612, currency: "SEK" },
      { id: "L2", date: "2026-09-05", text: "Inbetalning faktura 1042", amount: 12500, currency: "SEK" },
    ]);
    expect(parsed.skipped).toEqual([]);
  });

  it("reads a comma export with quoted fields, a BOM and a currency column", () => {
    const csv =
      "﻿Radnummer,Clearingnummer,Kontonummer,Produkt,Valuta,Bokföringsdag,Transaktionsdag,Valutadag,Referens,Beskrivning,Belopp,Bokfört saldo\n" +
      '1,8327,1234567,Företagskonto,SEK,2026-09-02,2026-09-01,2026-09-02,"ICA MAXI","ICA MAXI MALMO",-342.00,9658.00\n';

    const parsed = parseStatement(csv);

    expect(parsed.columns.text).toBe("Beskrivning");
    expect(parsed.lines).toEqual([
      { id: "L1", date: "2026-09-01", text: "ICA MAXI MALMO", amount: -342, currency: "SEK" },
    ]);
  });

  it("reports rows it can't read instead of guessing", () => {
    const csv = "Datum;Text;Belopp\n2026-09-01;Spotify;-119,00\nSumma;;-119,00\n2026-09-02;Oops;n/a\n";

    const parsed = parseStatement(csv);

    expect(parsed.lines).toHaveLength(1);
    expect(parsed.skipped).toEqual([
      { row: 3, reason: "No readable date" },
      { row: 4, reason: "No readable amount" },
    ]);
  });

  it("refuses a file without recognisable columns", () => {
    expect(() => parseStatement("foo;bar\n1;2\n")).toThrow(StatementParseError);
  });
});
