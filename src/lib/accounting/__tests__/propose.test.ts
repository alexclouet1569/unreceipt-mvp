import { describe, expect, it } from "vitest";
import { bookingMarker, isBalanced, proposeBooking, type ProposalInput, type ProposalReceipt } from "@/lib/accounting/propose";
import type { BookingContext, FortnoxAccount } from "@/lib/accounting/types";

const ACCOUNTS = ["1930", "2640", "2890", "5420", "5800", "5830", "6072", "6110", "6990", "6540"];

function ctx(over: Partial<BookingContext> = {}): BookingContext {
  const accounts = new Map<string, FortnoxAccount>(
    ACCOUNTS.map((n) => [n, { number: n, description: `Konto ${n}`, active: true }]),
  );
  return {
    accounts,
    financialYears: [{ id: 7, from: "2026-01-01", to: "2026-12-31" }],
    lockedThrough: "2026-06-30",
    voucherSeries: ["A", "UL"],
    ...over,
  };
}

const RECEIPT: ProposalReceipt = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
  status: "verified",
  merchant_name: "Clas Ohlson AB",
  category: "office_supplies",
  currency: "SEK",
  total: 125,
  tax_amount: 25,
  tax_rate: 25,
  vat_lines: null,
  home_total: null,
  home_currency: null,
  fx_source: null,
  receipt_date: "2026-11-12",
  purchased_at: null,
  bas_account: null,
  booked_at: null,
  paid_by: "company",
  approval_status: null,
  exported_at: null,
  merchant_vat_number: null,
};

function input(over: Partial<ProposalInput> = {}, receipt: Partial<ProposalReceipt> = {}): ProposalInput {
  return {
    receipt: { ...RECEIPT, ...receipt },
    companyCurrency: "SEK",
    context: ctx(),
    settings: { voucherSeries: "UL", creditAccountCompany: "1930", creditAccountEmployee: "2890", vatStatus: "full" },
    ...over,
  };
}

function proposal(over: Partial<ProposalInput> = {}, receipt: Partial<ProposalReceipt> = {}) {
  const result = proposeBooking(input(over, receipt));
  if (result.kind !== "proposal") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
  return result.proposal;
}

function blocks(over: Partial<ProposalInput> = {}, receipt: Partial<ProposalReceipt> = {}) {
  const result = proposeBooking(input(over, receipt));
  if (result.kind !== "blocked") throw new Error(`expected blocks, got ${JSON.stringify(result)}`);
  return result.blocks;
}

describe("proposeBooking", () => {
  it("books a Swedish 25% receipt: cost, input VAT, paid from the company account", () => {
    const p = proposal();
    expect(p.voucher.rows).toEqual([
      { account: "6110", debit: 100, credit: 0 },
      { account: "2640", debit: 25, credit: 0 },
      { account: "1930", debit: 0, credit: 125 },
    ]);
    expect(p.voucher).toMatchObject({ transactionDate: "2026-11-12", series: "UL", financialYearId: 7, totalSek: 125 });
    expect(p.voucher.description).toBe("Clas Ohlson AB · UnReceipt a1b2c3d4e5f6");
    expect(p.source).toBe("category");
    expect(isBalanced(p.voucher.rows)).toBe(true);
  });

  it("splits a receipt with 12% and 25% lines into one input VAT row", () => {
    const p = proposal({}, {
      total: 222,
      tax_amount: 34,
      tax_rate: null,
      vat_lines: [
        { rate: 12, net: 100, vat: 12 },
        { rate: 25, net: 88, vat: 22 },
      ],
    });
    expect(p.voucher.rows).toEqual([
      { account: "6110", debit: 188, credit: 0 },
      { account: "2640", debit: 34, credit: 0 },
      { account: "1930", debit: 0, credit: 222 },
    ]);
  });

  it("books an employee's outlay against the employee account", () => {
    const p = proposal({}, { paid_by: "employee", approval_status: "approved" });
    expect(p.voucher.rows.at(-1)).toEqual({ account: "2890", debit: 0, credit: 125 });
  });

  it("books representation whole on 6072, without input VAT, and says so", () => {
    const p = proposal({}, { category: "client_entertainment", total: 560, tax_amount: 60, tax_rate: 12 });
    expect(p.voucher.rows).toEqual([
      { account: "6072", debit: 560, credit: 0 },
      { account: "1930", debit: 0, credit: 560 },
    ]);
    expect(p.notes).toContain("representation_vat");
  });

  it("books a foreign receipt at the bank's amount, foreign VAT in the cost", () => {
    const p = proposal({}, {
      currency: "EUR",
      total: 50,
      tax_amount: 10,
      home_currency: "SEK",
      home_total: 572.4,
      fx_source: "manual",
    });
    expect(p.voucher.rows).toEqual([
      { account: "6110", debit: 572.4, credit: 0 },
      { account: "1930", debit: 0, credit: 572.4 },
    ]);
    expect(p.notes).toContain("foreign_vat_in_cost");
  });

  it("refuses an ECB estimate: the bank amount comes first", () => {
    expect(blocks({}, { currency: "EUR", total: 50, tax_amount: null, home_currency: "SEK", home_total: 572.4, fx_source: "ecb" })).toEqual([
      "fx_bank_amount_needed",
    ]);
  });

  it("prefers a person's choice, then the firm's, then memory, then the category", () => {
    expect(proposal({ personAccount: "6540", memoryAccount: "5420" }, { bas_account: "6990" }).debitAccount).toBe("6540");
    expect(proposal({ memoryAccount: "5420" }, { bas_account: "6990" })).toMatchObject({ debitAccount: "6990", source: "override" });
    expect(proposal({ memoryAccount: "5420" })).toMatchObject({ debitAccount: "5420", source: "memory" });
  });

  it("skips an inactive memory account but refuses an inactive firm choice", () => {
    const c = ctx();
    (c.accounts as Map<string, FortnoxAccount>).set("5420", { number: "5420", description: "", active: false });
    expect(proposal({ context: c, memoryAccount: "5420" }).debitAccount).toBe("6110");
    expect(blocks({ context: c }, { bas_account: "5420" })).toEqual(["account_inactive"]);
  });

  it("asks the model for 'other' (a SEK receipt), and validates its answer", () => {
    expect(proposeBooking(input({}, { category: "other" })).kind).toBe("needs_model");
    const p = proposal({ modelChoice: { account: "6540", reason: "IT-tjänster", confidence: 0.95 } }, { category: "other" });
    expect(p).toMatchObject({ debitAccount: "6540", source: "model", reason: "IT-tjänster" });
    expect(p.confidence).toBe(0.7);
    expect(p.notes).toContain("model_choice");
    expect(blocks({ modelChoice: { account: "9999", reason: "x", confidence: 0.9 } }, { category: "other" })).toEqual([
      "no_account",
    ]);
  });

  it("refuses what a person must look at", () => {
    expect(blocks({}, { status: "pending_review" })).toContain("not_confirmed");
    expect(blocks({}, { approval_status: "submitted" })).toContain("not_approved");
    expect(blocks({}, { booked_at: "2026-11-13T10:00:00Z" })).toContain("already_booked");
    expect(blocks({ companyCurrency: "EUR" })).toContain("company_not_sek");
    expect(blocks({ settings: null })).toContain("settings_missing");
    expect(blocks({ settings: { voucherSeries: "Z", creditAccountCompany: "1930", creditAccountEmployee: null, vatStatus: "full" } })).toContain(
      "series_unknown",
    );
    expect(blocks({}, { receipt_date: null, purchased_at: null })).toContain("no_date");
    expect(blocks({}, { receipt_date: "2026-06-30" })).toContain("period_locked");
    expect(blocks({}, { receipt_date: "2027-01-02" })).toContain("no_financial_year");
    expect(blocks({}, { currency: "EUR", home_total: null, category: "meals" })).toContain("no_sek_amount");
    expect(blocks({}, { total: -125, tax_amount: -25 })).toContain("refund");
  });

  it("refuses VAT it can't place", () => {
    // A rate that isn't Swedish on a SEK receipt.
    expect(blocks({}, { tax_rate: 20, tax_amount: 20, total: 120 })).toContain("vat_rate_unknown");
    // A split that doesn't add up to the printed VAT.
    expect(blocks({}, { vat_lines: [{ rate: 25, net: 100, vat: 25 }], tax_amount: 30 })).toContain("vat_inconsistent");
    // VAT as large as the total.
    expect(blocks({}, { total: 25, tax_amount: 25, tax_rate: 25 })).toContain("vat_inconsistent");
  });

  it("refuses inactive payment and VAT accounts", () => {
    const c = ctx();
    (c.accounts as Map<string, FortnoxAccount>).delete("1930");
    expect(blocks({ context: c })).toContain("credit_account_inactive");
    const d = ctx();
    (d.accounts as Map<string, FortnoxAccount>).delete("2640");
    expect(blocks({ context: d })).toContain("vat_account_inactive");
  });

  it("reads the day from purchased_at without shifting it", () => {
    expect(proposal({}, { receipt_date: null, purchased_at: "2026-11-30T23:30:00Z" }).voucher.transactionDate).toBe(
      "2026-11-30",
    );
  });

  it("rounds to the öre and stays balanced", () => {
    const p = proposal({}, { total: 99.9, tax_amount: 19.98, tax_rate: 25 });
    expect(p.voucher.rows).toEqual([
      { account: "6110", debit: 79.92, credit: 0 },
      { account: "2640", debit: 19.98, credit: 0 },
      { account: "1930", debit: 0, credit: 99.9 },
    ]);
  });
});

describe("proposeBooking: VAT only when it may be deducted (compliance review 2026-11-20)", () => {
  it("keeps VAT out of 2640 on a representation or car account, whatever the category", () => {
    const c = ctx();
    (c.accounts as Map<string, FortnoxAccount>).set("6072", { number: "6072", description: "", active: true });
    (c.accounts as Map<string, FortnoxAccount>).set("5611", { number: "5611", description: "", active: true });
    const viaMemory = proposal({ context: c, memoryAccount: "6072" }, { category: "meals" });
    expect(viaMemory.voucher.rows).toEqual([
      { account: "6072", debit: 125, credit: 0 },
      { account: "1930", debit: 0, credit: 125 },
    ]);
    expect(viaMemory.notes).toContain("restricted_account_vat");
    const viaModel = proposal(
      { context: c, modelChoice: { account: "5611", reason: "Drivmedel", confidence: 0.8 } },
      { category: "other" },
    );
    expect(viaModel.voucher.rows.some((r) => r.account === "2640")).toBe(false);
  });

  it("asks whether the company deducts VAT before booking any", () => {
    const s = { voucherSeries: "UL", creditAccountCompany: "1930", creditAccountEmployee: "2890" };
    expect(blocks({ settings: { ...s, vatStatus: null } })).toEqual(["vat_status_missing"]);
    expect(blocks({ settings: { ...s, vatStatus: "partial" } })).toEqual(["vat_partial"]);
    const none = proposal({ settings: { ...s, vatStatus: "none" } });
    expect(none.voucher.rows).toEqual([
      { account: "6110", debit: 125, credit: 0 },
      { account: "1930", debit: 0, credit: 125 },
    ]);
    expect(none.notes).toContain("vat_not_deducted");
  });

  it("deducts VAT on a simplified invoice up to 4,000 kr, not above", () => {
    expect(proposal({}, { total: 4000, tax_amount: 800, tax_rate: 25 }).voucher.rows[1]).toEqual({
      account: "2640",
      debit: 800,
      credit: 0,
    });
    expect(blocks({}, { total: 4000.01, tax_amount: 800, tax_rate: 25 })).toEqual(["over_simplified_invoice"]);
  });

  it("refuses a VAT amount that doesn't match its rate", () => {
    expect(blocks({}, { total: 125, tax_amount: 50, tax_rate: 25 })).toEqual(["vat_inconsistent"]);
  });

  it("books a SEK receipt without VAT whole, and says no VAT was read", () => {
    const p = proposal({}, { tax_amount: null, tax_rate: null });
    expect(p.voucher.rows).toEqual([
      { account: "6110", debit: 125, credit: 0 },
      { account: "1930", debit: 0, credit: 125 },
    ]);
    expect(p.notes).toContain("no_vat_read");
  });

  it("refuses possible reverse charge", () => {
    expect(blocks({}, { currency: "USD", category: "software", home_currency: "SEK", home_total: 200, fx_source: "manual", tax_amount: null })).toEqual([
      "reverse_charge_check",
    ]);
    expect(blocks({}, { tax_amount: null, tax_rate: null, merchant_vat_number: "IE6388047V" })).toEqual(["reverse_charge_check"]);
  });

  it("refuses an exported receipt (it may be in Fortnox already) and one without a merchant", () => {
    expect(blocks({}, { exported_at: "2026-11-15T10:00:00Z" })).toEqual(["already_exported"]);
    expect(blocks({}, { merchant_name: "  " })).toContain("no_merchant");
  });

  it("asks who paid: shown as the company's until approval, required at approval", () => {
    const p = proposal({}, { paid_by: null });
    expect(p.notes).toContain("paid_by_assumed");
    expect(blocks({ requirePaidBy: true }, { paid_by: null })).toEqual(["paid_by_missing"]);
    expect(proposal({ requirePaidBy: true, paidBy: "employee" }, { paid_by: null }).voucher.rows.at(-1)).toEqual({
      account: "2890",
      debit: 0,
      credit: 125,
    });
  });

  it("only debits expense accounts", () => {
    expect(blocks({ personAccount: "1930" })).toEqual(["account_not_cost"]);
    expect(blocks({ personAccount: "2640" })).toEqual(["account_not_cost"]);
  });

  it("flags meals, large amounts and a digital copy", () => {
    expect(proposal({}, { category: "meals", total: 112, tax_amount: 12, tax_rate: 12 }).notes).toContain("check_deductibility");
    expect(proposal({}, { total: 37500, tax_amount: null, tax_rate: null }).notes).toContain("possible_asset");
    expect(proposal({ originalAttached: false }).notes).toContain("digital_copy");
  });

  it("checks the year's and the locked period's edges, and impossible dates", () => {
    expect(proposal({}, { receipt_date: "2026-12-31" }).voucher.financialYearId).toBe(7);
    expect(blocks({}, { receipt_date: "2027-01-01" })).toContain("no_financial_year");
    expect(proposal({}, { receipt_date: "2026-07-01" }).voucher.transactionDate).toBe("2026-07-01");
    expect(blocks({}, { receipt_date: "2026-02-31" })).toContain("no_date");
  });
});

describe("isBalanced and the marker", () => {
  it("rejects one-sided, negative and mismatched rows", () => {
    expect(isBalanced([{ account: "6110", debit: 10, credit: 0 }])).toBe(false);
    expect(isBalanced([{ account: "6110", debit: 10, credit: 0 }, { account: "1930", debit: 0, credit: 9.99 }])).toBe(false);
    expect(isBalanced([{ account: "6110", debit: 10, credit: 10 }, { account: "1930", debit: 0, credit: 0 }])).toBe(false);
    expect(isBalanced([{ account: "61", debit: 10, credit: 0 }, { account: "1930", debit: 0, credit: 10 }])).toBe(false);
  });

  it("marks with the receipt id's first 12 hex digits", () => {
    expect(bookingMarker("A1B2C3D4-E5F6-7890-ABCD-EF0123456789")).toBe("UnReceipt a1b2c3d4e5f6");
  });
});
