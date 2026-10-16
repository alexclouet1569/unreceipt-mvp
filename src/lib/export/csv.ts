/**
 * receipts.csv for the accountant export. Pure.
 *
 * Format choices, for Swedish spreadsheet users (Excel / Numbers in sv-SE):
 * UTF-8 with a BOM so Excel reads å/ä/ö, `;` between fields, decimal comma
 * in amounts, ISO dates. Any cell that a spreadsheet would run as a formula
 * (starts with = + - @, tab or CR) gets a leading apostrophe: merchant names
 * and notes can come from forwarded emails, i.e. from strangers.
 */

import { CATEGORY_CONFIG } from "@/lib/receipt-format";
import { vatCheckSummary } from "@/lib/compliance/se-vat-check";
import type { CompanyCountry } from "@/lib/company-country";
import type { Receipt } from "@/lib/types";

export const CSV_COLUMNS = [
  "Date",
  "Merchant",
  "Total",
  "Currency",
  "VAT amount",
  "VAT rate %",
  "Category",
  "Payment method",
  "Card last 4",
  "Merchant VAT no.",
  "Merchant org. no.",
  "Billed to",
  "VAT check (Sweden)",
  "Status",
  "Source",
  "Edited by you",
  "Notes",
  "PDF file",
  "Original file",
  "Captured at",
  "Receipt ID",
] as const;

export type CsvRow = {
  receipt: Receipt;
  pdfFile: string | null;
  originalFile: string | null;
};

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvAmount(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function csvNumber(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n).replace(".", ",") : "";
}

/**
 * The purchase date as YYYY-MM-DD in Swedish time: an email receipt paid
 * at 00:30 in Stockholm is stored as the previous day in UTC.
 */
export function receiptDate(r: Pick<Receipt, "purchased_at" | "receipt_date">): string {
  if (r.purchased_at) {
    const d = new Date(r.purchased_at);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    }
  }
  return (r.receipt_date ?? "").slice(0, 10);
}

function stockholmDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }).slice(0, 16);
}

/**
 * `companyCountry` decides the "VAT check (Sweden)" column: filled only for
 * a company in Sweden (see src/lib/compliance/se-vat-check.ts).
 */
export function buildReceiptsCsv(
  rows: CsvRow[],
  companyCountry: CompanyCountry | null = null,
): string {
  const lines = [CSV_COLUMNS.map(csvCell).join(";")];
  for (const { receipt: r, pdfFile, originalFile } of rows) {
    lines.push(
      [
        csvCell(receiptDate(r)),
        csvCell(r.merchant_name),
        csvAmount(r.total),
        csvCell(r.currency),
        csvAmount(r.tax_amount),
        csvNumber(r.tax_rate),
        csvCell(CATEGORY_CONFIG[r.category]?.label ?? r.category),
        csvCell(r.payment_method),
        csvCell(r.card_last_four),
        csvCell(r.merchant_vat_number),
        csvCell(r.merchant_org_number ?? null),
        csvCell([r.buyer_name, r.buyer_address].filter(Boolean).join(", ") || null),
        csvCell(vatCheckSummary(r, companyCountry)),
        csvCell(r.status === "verified" ? "Ready" : "Needs review"),
        csvCell(r.source),
        csvCell(r.edited_at ? r.edited_at.slice(0, 10) : ""),
        csvCell(r.notes),
        csvCell(pdfFile),
        csvCell(originalFile),
        csvCell(stockholmDateTime(r.created_at)),
        csvCell(r.id),
      ].join(";"),
    );
  }
  // CRLF: what Excel writes and expects.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
