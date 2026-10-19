import { describe, expect, it } from "vitest";
import type { StatementLine } from "../parse-statement";
import { namesAgree, noReceiptNote, reconcile, type MatchableReceipt } from "../match";

const line = (id: string, date: string, text: string, amount: number, currency = "SEK"): StatementLine => ({
  id,
  date,
  text,
  amount,
  currency,
});

const receipt = (
  id: string,
  merchant: string,
  total: number,
  date: string,
  currency = "SEK",
): MatchableReceipt => ({ id, merchant_name: merchant, total, receipt_date: date, currency });

describe("namesAgree", () => {
  it.each([
    ["KORTKÖP 260903 CIRCLE K MALMO", "Circle K"],
    ["ADOBE *CREATIVE CLD", "Adobe Systems Software Ireland Ltd"],
    ["UBER *TRIP HELP.UBER.COM", "Uber"],
    ["BAUHAUS MALMÖ", "Bauhaus & Co KB"],
    ["K*BOKUS.COM", "Bokus AB"],
  ])("%s ≈ %s", (bank, merchant) => {
    expect(namesAgree(bank, merchant)).toBe(true);
  });

  it.each([
    ["CLAS OHLSON MALMO", "Spotify AB"],
    ["SWISH BETALNING", "Swish"],
    ["ICA MAXI MALMO", null],
  ])("%s ≠ %s", (bank, merchant) => {
    expect(namesAgree(bank, merchant)).toBe(false);
  });
});

describe("noReceiptNote", () => {
  it.each([
    "SKATTEVERKET 16 5567-1234",
    "LÖN SEPTEMBER",
    "Egen överföring sparkonto",
    "BANKOMAT TRIANGELN",
    "Paketavgift",
    "Ränta",
  ])("%s needs no receipt", (text) => {
    expect(noReceiptNote(text)).not.toBeNull();
  });

  it.each(["Parkeringsavgift Malmö Stad", "LONELY PLANET", "Circle K"])("%s still needs one", (text) => {
    expect(noReceiptNote(text)).toBeNull();
  });
});

describe("reconcile", () => {
  it("sorts every line into one status", () => {
    const statement = [
      line("L1", "2026-09-03", "KORTKÖP 260903 CIRCLE K MALMO", -612),
      line("L2", "2026-09-05", "BAUHAUS MALMO", -1899),
      line("L3", "2026-09-08", "RESTAURANG ATMOSFÄR", -1340),
      line("L4", "2026-09-10", "SKATTEVERKET", -8420),
      line("L5", "2026-09-12", "Inbetalning faktura 1042", 12500),
      line("L6", "2026-09-14", "UBER *TRIP", -268.5),
    ];
    const receipts = [
      receipt("r-ck", "Circle K", 612, "2026-09-02"),
      receipt("r-atm", "Restaurang Atmosfär", 1220, "2026-09-07"),
      receipt("r-uber", "Uber", 23.4, "2026-09-13", "EUR"),
      receipt("r-cash", "Malmö Saluhall", 189, "2026-09-20"),
    ];

    const result = reconcile(statement, receipts);

    expect(result.lines.map((l) => [l.line.id, l.status, l.receiptId])).toEqual([
      ["L1", "matched", "r-ck"],
      ["L2", "missing", null],
      ["L3", "check", "r-atm"],
      ["L4", "no_receipt", null],
      ["L5", "money_in", null],
      ["L6", "check", "r-uber"],
    ]);
    expect(result.lines[2].note).toMatch(/tip/);
    expect(result.lines[5].note).toMatch(/EUR/);
    expect(result.lines.map((l) => l.check)).toEqual([
      null,
      null,
      "different_amount",
      null,
      null,
      "different_currency",
    ]);
    expect(result.unmatchedReceiptIds).toEqual(["r-cash"]);
    expect(result.summary).toEqual({
      needReceipt: 4,
      matched: 1,
      check: 2,
      missing: 1,
      noReceipt: 1,
      moneyIn: 1,
    });
  });

  it("calls a same-amount receipt from another shop 'check', never 'matched'", () => {
    const result = reconcile(
      [line("L1", "2026-09-03", "CLAS OHLSON MALMO", -199)],
      [receipt("r1", "Spotify AB", 199, "2026-09-03")],
    );
    expect(result.lines[0]).toMatchObject({ status: "check", receiptId: "r1", check: "different_shop" });
  });

  it("uses each receipt once, for the closest date", () => {
    const result = reconcile(
      [
        line("L1", "2026-09-03", "ESPRESSO HOUSE", -68),
        line("L2", "2026-09-10", "ESPRESSO HOUSE", -68),
      ],
      [receipt("r1", "Espresso House", 68, "2026-09-10")],
    );
    expect(result.lines.map((l) => l.status)).toEqual(["missing", "matched"]);
    expect(result.lines[1].receiptId).toBe("r1");
  });

  it("ignores receipts far from the bank date", () => {
    const result = reconcile(
      [line("L1", "2026-09-20", "CIRCLE K", -612)],
      [receipt("r1", "Circle K", 612, "2026-09-01")],
    );
    expect(result.lines[0].status).toBe("missing");
  });

  it("lets the accountant overrule the no-receipt guess both ways", () => {
    const statement = [
      line("L1", "2026-09-10", "SKATTEVERKET", -8420),
      line("L2", "2026-09-11", "SWISH 0701234567", -500),
    ];
    const result = reconcile(statement, [], {
      overrides: { L1: "needs_receipt", L2: "no_receipt" },
    });
    expect(result.lines.map((l) => l.status)).toEqual(["missing", "no_receipt"]);
  });
});
