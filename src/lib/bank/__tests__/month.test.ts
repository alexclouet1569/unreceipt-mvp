import { describe, expect, it } from "vitest";
import type { BankTransaction, Receipt } from "@/lib/types";
import { bankWindow, buildBankMonth, monthDays, receiptDay } from "../month";

const line = (over: Partial<BankTransaction>): BankTransaction => ({
  id: "t",
  organization_id: "org",
  booked_on: "2026-11-04",
  amount: -100,
  currency: "SEK",
  description: "",
  linked_receipt_id: null,
  no_receipt_reason: null,
  decided_by: null,
  decided_at: null,
  reminded_at: null,
  imported_by: null,
  imported_at: "2026-11-30T10:00:00Z",
  ...over,
});

const receipt = (over: Partial<Receipt>): Receipt =>
  ({
    id: "r",
    merchant_name: "Shop",
    total: 100,
    currency: "SEK",
    receipt_date: "2026-11-03",
    purchased_at: null,
    home_total: null,
    home_currency: null,
    fx_source: null,
    ...over,
  }) as Receipt;

describe("month helpers", () => {
  it("knows the month's days and the window matching needs", () => {
    expect(monthDays("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(bankWindow("2026-11")).toEqual({
      txFrom: "2026-09-17",
      txTo: "2027-01-14",
      receiptFrom: "2026-08-03",
      receiptTo: "2027-01-17",
    });
  });

  it("reads the receipt's day from receipt_date, else purchased_at in Stockholm", () => {
    expect(receiptDay({ receipt_date: "2026-11-03", purchased_at: null })).toBe("2026-11-03");
    // 23:30 UTC on the 2nd is the 3rd in Stockholm.
    expect(receiptDay({ receipt_date: null, purchased_at: "2026-11-02T23:30:00Z" })).toBe("2026-11-03");
    expect(receiptDay({ receipt_date: null, purchased_at: null })).toBeNull();
  });
});

describe("buildBankMonth", () => {
  it("shows the month's lines with counts, missing totals and what can be linked", () => {
    const view = buildBankMonth(
      [
        line({ id: "ok", booked_on: "2026-11-04" }),
        line({ id: "miss1", booked_on: "2026-11-10", amount: -1249, reminded_at: "2026-11-20T08:00:00Z" }),
        line({ id: "miss2", booked_on: "2026-11-12", amount: -655.5 }),
        line({ id: "fee", booked_on: "2026-11-30", amount: -45, no_receipt_reason: "bank_fee" }),
        line({ id: "in", booked_on: "2026-11-15", amount: 5000 }),
        // Outside the month: used for matching, not shown.
        line({ id: "oct", booked_on: "2026-10-31", amount: -77 }),
      ],
      [
        receipt({ id: "r-ok" }),
        receipt({ id: "r-free", merchant_name: "Restaurang", total: 450, receipt_date: "2026-11-11" }),
        receipt({ id: "r-review", total: null, receipt_date: "2026-11-11" }),
      ],
      "2026-11"
    );
    expect(view.lines.map((l) => l.id)).toEqual(["ok", "miss1", "miss2", "fee", "in"]);
    expect(view.lines[0]).toMatchObject({ state: { kind: "matched", receiptId: "r-ok" }, receipt: { merchant: "Shop" } });
    expect(view.counts).toEqual({ out: 4, matched: 1, missing: 2, noReceipt: 1, moneyIn: 1 });
    expect(view.missingTotals).toEqual([{ currency: "SEK", amount: 1904.5 }]);
    expect(view.lastRemindedAt).toBe("2026-11-20T08:00:00Z");
    // A receipt without an amount can't be linked to a payment.
    expect(view.linkCandidates.map((c) => c.id)).toEqual(["r-free"]);
  });

  it("reads amounts that Postgres returned as strings", () => {
    const view = buildBankMonth([line({ amount: "-100.00" as unknown as number })], [receipt({ id: "r1" })], "2026-11");
    expect(view.counts.matched).toBe(1);
  });
});
