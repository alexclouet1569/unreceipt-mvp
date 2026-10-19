/**
 * The reconciliation as a spreadsheet for the accountant: one row per bank
 * line with its status and the receipt it was matched to. Pure. Same format
 * as the receipts export (src/lib/export/csv.ts): BOM, `;`, decimal comma.
 */

import { csvAmount, csvCell } from "@/lib/export/csv";
import type { LineStatus, MatchableReceipt, ReconciledLine } from "./match";

export const STATUS_LABEL: Record<LineStatus, string> = {
  matched: "Matched",
  check: "Check",
  missing: "Missing",
  no_receipt: "No receipt needed",
  money_in: "Money in",
};

const COLUMNS = [
  "Date",
  "Bank text",
  "Amount",
  "Currency",
  "Status",
  "Receipt merchant",
  "Receipt date",
  "Receipt total",
  "Receipt currency",
  "Note",
] as const;

export function buildReconciliationCsv(
  lines: ReconciledLine[],
  receipts: MatchableReceipt[],
): string {
  const byId = new Map(receipts.map((r) => [r.id, r]));
  const rows = lines.map(({ line, status, receiptId, note }) => {
    const r = receiptId ? byId.get(receiptId) : undefined;
    return [
      csvCell(line.date),
      csvCell(line.text),
      csvAmount(line.amount),
      csvCell(line.currency),
      csvCell(STATUS_LABEL[status]),
      csvCell(r?.merchant_name),
      csvCell(r?.receipt_date),
      csvAmount(r?.total),
      csvCell(r?.currency),
      csvCell(note),
    ].join(";");
  });
  return "﻿" + [COLUMNS.map(csvCell).join(";"), ...rows].join("\r\n") + "\r\n";
}
