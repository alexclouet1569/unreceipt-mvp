import { describe, expect, it } from "vitest";
import type { Receipt } from "@/lib/types";
import { applyPatch, applyReceiptChange } from "../optimistic";

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: "r1",
    merchant_name: "Pressbyrån",
    total: 120,
    currency: "EUR",
    receipt_date: "2026-11-02",
    category: "meals",
    status: "pending_review",
    notes: null,
    tax_amount: null,
    tax_rate: null,
    payment_method: null,
    items: null,
    home_currency: "SEK",
    home_total: 1380,
    fx_rate: 11.5,
    fx_date: "2026-11-02",
    fx_source: "ecb",
    ...over,
  } as Receipt;
}

describe("applyPatch", () => {
  it("maps the edit form's keys onto the receipt and sets the new status", () => {
    const r = applyPatch(receipt(), { merchant: "ICA", category: "office_supplies", notes: null }, "verified");
    expect(r.merchant_name).toBe("ICA");
    expect(r.category).toBe("office_supplies");
    expect(r.status).toBe("verified");
    // Nothing that changes the conversion: it stays.
    expect(r.home_total).toBe(1380);
  });

  it("drops the conversion when amount, currency or date change, as the server's trigger does", () => {
    for (const patch of [{ amount: 99 }, { currency: "USD" }, { receipt_date: "2026-11-03" }, { home_total: null }]) {
      const r = applyPatch(receipt(), patch);
      expect(r.home_total, JSON.stringify(patch)).toBeNull();
      expect(r.fx_source).toBeNull();
    }
  });

  it("keeps a typed home amount as a manual conversion in the company's currency", () => {
    const r = applyPatch(receipt({ home_currency: null, home_total: null, fx_source: null }), { home_total: 1400 }, undefined, "SEK");
    expect(r).toMatchObject({ home_total: 1400, home_currency: "SEK", fx_source: "manual" });
  });

  it("never changes the receipt it was given", () => {
    const before = receipt();
    applyPatch(before, { merchant: "ICA" }, "verified");
    expect(before.merchant_name).toBe("Pressbyrån");
    expect(before.status).toBe("pending_review");
  });
});

describe("applyReceiptChange", () => {
  const list = [receipt(), receipt({ id: "r2", merchant_name: "SJ" })];

  it("removes a deleted receipt", () => {
    expect(applyReceiptChange(list, { kind: "remove", id: "r1" }).map((r) => r.id)).toEqual(["r2"]);
  });

  it("updates only the receipt with that id", () => {
    const next = applyReceiptChange(list, { kind: "update", id: "r2", patch: { merchant: "SJ AB" } });
    expect(next.map((r) => r.merchant_name)).toEqual(["Pressbyrån", "SJ AB"]);
  });

  it("leaves the list alone for an id it doesn't hold", () => {
    expect(applyReceiptChange(list, { kind: "remove", id: "nope" })).toHaveLength(2);
  });
});
