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
  "Status",
  "Source",
  "Edited by you",
  "Notes",
  "PDF file",
  "Original file",
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

export function receiptDate(r: Pick<Receipt, "purchased_at" | "receipt_date">): string {
  return (r.purchased_at ?? r.receipt_date ?? "").slice(0, 10);
}

export function buildReceiptsCsv(rows: CsvRow[]): string {
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
        csvCell(r.status === "verified" ? "Ready" : "Needs review"),
        csvCell(r.source),
        csvCell(r.edited_at ? r.edited_at.slice(0, 10) : ""),
        csvCell(r.notes),
        csvCell(pdfFile),
        csvCell(originalFile),
        csvCell(r.id),
      ].join(";"),
    );
  }
  // CRLF: what Excel writes and expects.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
