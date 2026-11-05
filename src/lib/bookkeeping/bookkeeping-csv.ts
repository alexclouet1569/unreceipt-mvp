// bookkeeping.csv for the firm export: one row per receipt per VAT rate,
// with the account suggestion, so a row maps straight onto a verifikat
// line. Same CSV conventions as receipts.csv (BOM, ';', decimal comma,
// CRLF, formula guard). Pure.

import { CATEGORY_CONFIG } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";
import { csvAmount, csvCell, receiptDate } from "@/lib/export/csv";
import { basAccountFor, VAT_INPUT_ACCOUNT } from "./bas-map";
import { INPUT_VAT_CURRENCY } from "./rules";
import { isSwedishRate, vatLinesFor } from "./vat-lines";

// bookkeeping.csv is the Swedish (BAS) export: its home columns are SEK.
const HOME = INPUT_VAT_CURRENCY;

export const BOOKKEEPING_COLUMNS = [
  "Date",
  "Receipt ID",
  "Merchant",
  "Seller org.nr",
  "Seller VAT no.",
  "Currency",
  "Total",
  // Real kronor only: the SEK receipt's own total, or the amount typed
  // from the bank statement for a foreign one.
  "Total SEK",
  // A foreign receipt converted at the ECB reference rate: an estimate for
  // the accountant, never mixed into Total SEK (src/lib/bookkeeping/rules.ts).
  "Total SEK (ECB estimate)",
  "SEK rate",
  // "ECB <date>" or "Entered manually (bank statement)". Empty for SEK.
  "Rate source",
  "VAT rate %",
  "Net (receipt currency)",
  "VAT (receipt currency)",
  "BAS account",
  "BAS account name",
  "VAT account",
  "Category",
  "Payment method",
  "Status",
  "Exported at",
  "Booked ref",
  "PDF file",
  "Original file",
] as const;

export type BookkeepingRow = {
  receipt: Receipt;
  pdfFile: string | null;
  originalFile: string | null;
};

function csvRate(rate: number | null): string {
  return rate == null ? "" : String(rate).replace(".", ",");
}

/**
 * 2640 only when the VAT can be Swedish input VAT: a SEK receipt, a
 * Swedish rate, a category whose VAT is deductible as such. Anything else
 * (foreign VAT, representation, an unreadable rate) gets no account and
 * the accountant decides. The CSV never claims the VAT is deductible.
 */
export function vatAccountFor(
  r: Pick<Receipt, "currency">,
  line: { rate: number | null; vat: number },
  inputVatDeductible: boolean
): string {
  if (line.vat <= 0) return "";
  if (r.currency !== INPUT_VAT_CURRENCY) return "";
  if (!isSwedishRate(line.rate)) return "";
  return inputVatDeductible ? VAT_INPUT_ACCOUNT : "";
}

export function buildBookkeepingCsv(rows: BookkeepingRow[]): string {
  const lines = [BOOKKEEPING_COLUMNS.map(csvCell).join(";")];
  for (const { receipt: r, pdfFile, originalFile } of rows) {
    const bas = basAccountFor(r);
    // A SEK receipt is its own SEK total. A foreign one has Total SEK only
    // when the bank-statement amount was typed in; an ECB conversion goes
    // in its own estimate column (src/lib/fx.ts).
    const foreign = r.currency !== HOME && r.home_currency === HOME && r.home_total != null;
    const manual = foreign && r.fx_source === "manual";
    const ecb = foreign && r.fx_source === "ecb";
    const totalSek = r.currency === HOME ? csvAmount(r.total) : manual ? csvAmount(r.home_total) : "";
    const totalSekEcb = ecb ? csvAmount(r.home_total) : "";
    const sekRate = (manual || ecb) && r.fx_rate != null ? csvRate(r.fx_rate) : "";
    const rateSource = manual
      ? "Entered manually (bank statement)"
      : ecb
        ? `ECB ${r.fx_date ?? ""}`.trim()
        : "";
    for (const line of vatLinesFor(r)) {
      lines.push(
        [
          csvCell(receiptDate(r)),
          csvCell(r.id),
          csvCell(r.merchant_name),
          csvCell(r.seller_org_number),
          csvCell(r.merchant_vat_number),
          csvCell(r.currency),
          csvAmount(r.total),
          totalSek,
          totalSekEcb,
          csvCell(sekRate),
          csvCell(rateSource),
          csvRate(line.rate),
          csvAmount(line.net),
          csvAmount(line.vat),
          csvCell(bas.account),
          csvCell(bas.name),
          csvCell(vatAccountFor(r, line, bas.inputVatDeductible)),
          csvCell(CATEGORY_CONFIG[r.category]?.label ?? r.category),
          csvCell(r.payment_method),
          csvCell(r.status === "verified" ? "Ready" : "Needs review"),
          csvCell(r.exported_at ? r.exported_at.slice(0, 10) : ""),
          csvCell(r.booked_ref),
          csvCell(pdfFile),
          csvCell(originalFile),
        ].join(";")
      );
    }
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
