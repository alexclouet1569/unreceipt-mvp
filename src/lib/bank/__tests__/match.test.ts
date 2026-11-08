import { describe, expect, it } from "vitest";
import { matchTransactions, nameAppears, pairScore, type MatchReceipt, type MatchTransaction } from "../match";

const tx = (over: Partial<MatchTransaction>): MatchTransaction => ({
  id: "t1",
  bookedOn: "2026-11-04",
  amount: -812,
  currency: "SEK",
  description: "CIRCLE K SOLLENTUNA",
  linkedReceiptId: null,
  noReceiptReason: null,
  ...over,
});

const rc = (over: Partial<MatchReceipt>): MatchReceipt => ({
  id: "r1",
  day: "2026-11-02",
  total: 812,
  currency: "SEK",
  homeTotal: null,
  homeCurrency: null,
  fxSource: null,
  merchant: "Circle K",
  ...over,
});

describe("nameAppears", () => {
  it("finds the merchant's name in bank text, ignoring case, accents and company suffixes", () => {
    expect(nameAppears("Circle K", "CIRCLE K SOLLENTUNA")).toBe(true);
    expect(nameAppears("Café Sjöstaden AB", "KORTKOP CAFE SJOSTADEN")).toBe(true);
    expect(nameAppears("Ahlsell Sverige AB", "BG 5051-6905 AHLSELL")).toBe(true);
    expect(nameAppears("Adobe", "PAYPAL *ADOBESYSTE")).toBe(true);
    expect(nameAppears("ICA", "PREEM SOLLENTUNA")).toBe(false);
    expect(nameAppears(null, "anything")).toBe(false);
  });
});

describe("pairScore", () => {
  it("needs the exact amount in the same currency", () => {
    expect(pairScore(tx({}), rc({}))).not.toBeNull();
    expect(pairScore(tx({ amount: -812.01 }), rc({}))).toBeNull();
    expect(pairScore(tx({ amount: 812 }), rc({}))).toBeNull();
  });

  it("allows a card markup on an ECB estimate, not on an amount typed from the bank", () => {
    const foreign = rc({ total: 24.19, currency: "EUR", homeTotal: 277.02, homeCurrency: "SEK", fxSource: "ecb", merchant: "Adobe" });
    expect(pairScore(tx({ amount: -282.5, description: "ADOBE *CREATIVE" }), foreign)).not.toBeNull();
    expect(pairScore(tx({ amount: -290 }), foreign)).toBeNull();
    const typed = { ...foreign, homeTotal: 281.4, fxSource: "manual" as const };
    expect(pairScore(tx({ amount: -281.4 }), typed)).not.toBeNull();
    expect(pairScore(tx({ amount: -282.5 }), typed)).toBeNull();
  });

  it("accepts a bank line from 3 days before to 45 days after the receipt", () => {
    expect(pairScore(tx({ bookedOn: "2026-10-30" }), rc({}))).not.toBeNull();
    expect(pairScore(tx({ bookedOn: "2026-10-29" }), rc({}))).toBeNull();
    expect(pairScore(tx({ bookedOn: "2026-12-17" }), rc({}))).not.toBeNull();
    expect(pairScore(tx({ bookedOn: "2026-12-18" }), rc({}))).toBeNull();
  });

  it("never matches a receipt without a date or an amount", () => {
    expect(pairScore(tx({}), rc({ day: null }))).toBeNull();
    expect(pairScore(tx({}), rc({ total: null }))).toBeNull();
  });
});

describe("matchTransactions", () => {
  it("marks lines matched, missing, money in, or no receipt needed", () => {
    const { states } = matchTransactions(
      [
        tx({ id: "match" }),
        tx({ id: "missing", amount: -1249, description: "HORNBACH" }),
        tx({ id: "in", amount: 5000 }),
        tx({ id: "fee", amount: -45, noReceiptReason: "bank_fee" }),
      ],
      [rc({})]
    );
    expect(states.get("match")).toEqual({ kind: "matched", receiptId: "r1", how: "auto" });
    expect(states.get("missing")).toEqual({ kind: "missing" });
    expect(states.get("in")).toEqual({ kind: "money_in" });
    expect(states.get("fee")).toEqual({ kind: "no_receipt", reason: "bank_fee" });
  });

  it("uses one receipt for one line: the second identical payment is missing", () => {
    const { states } = matchTransactions(
      [tx({ id: "a", bookedOn: "2026-11-03" }), tx({ id: "b", bookedOn: "2026-11-20" })],
      [rc({})]
    );
    expect(states.get("a")).toEqual({ kind: "matched", receiptId: "r1", how: "auto" });
    expect(states.get("b")).toEqual({ kind: "missing" });
  });

  it("gives a monthly subscription's receipt to its own month, not the next one", () => {
    const sub = (id: string, day: string) => rc({ id, day, total: 99, merchant: "Spotify" });
    const pay = (id: string, bookedOn: string) => tx({ id, bookedOn, amount: -99, description: "SPOTIFY" });
    const { states } = matchTransactions(
      [pay("nov", "2026-11-02"), pay("oct", "2026-10-02")],
      [sub("r-oct", "2026-10-01"), sub("r-nov", "2026-11-01")]
    );
    expect(states.get("oct")).toMatchObject({ receiptId: "r-oct" });
    expect(states.get("nov")).toMatchObject({ receiptId: "r-nov" });
  });

  it("prefers the receipt whose merchant is named in the bank text", () => {
    const { states } = matchTransactions(
      [tx({ description: "PREEM SOLLENTUNA", bookedOn: "2026-11-05" })],
      [rc({ id: "circle", day: "2026-11-05" }), rc({ id: "preem", day: "2026-11-03", merchant: "Preem" })]
    );
    expect(states.get("t1")).toMatchObject({ receiptId: "preem" });
  });

  it("keeps the accountant's link, and drops a link to a receipt that is gone", () => {
    const { states, usedReceiptIds } = matchTransactions(
      [
        tx({ id: "tip", amount: -500, linkedReceiptId: "r-dinner" }),
        tx({ id: "gone", amount: -70, linkedReceiptId: "deleted" }),
      ],
      [rc({ id: "r-dinner", total: 450 })]
    );
    expect(states.get("tip")).toEqual({ kind: "matched", receiptId: "r-dinner", how: "manual" });
    expect(states.get("gone")).toEqual({ kind: "missing" });
    expect(usedReceiptIds.has("r-dinner")).toBe(true);
  });

  it("does not auto-match a receipt the accountant linked to another line", () => {
    const { states } = matchTransactions(
      [tx({ id: "manual", amount: -999, linkedReceiptId: "r1" }), tx({ id: "auto" })],
      [rc({})]
    );
    expect(states.get("auto")).toEqual({ kind: "missing" });
  });
});
