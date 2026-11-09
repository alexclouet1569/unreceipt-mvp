// One photo or scanned page from "Several receipts at once"
// (/api/capture/scan) as receipt fields. Pure.
//
// Nobody checks these fields before they are saved, so they are treated
// like any untrusted extraction (src/lib/receipts/ocr-fields.ts): the
// confidence is capped below the review threshold and the receipt lands
// in Review needed, filled in, waiting for a one-click confirmation. When
// the model couldn't read everything, what it did read is kept and only
// the rest is left for the person to fill in ("Missing amount").

import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import type { OcrResult } from "@/lib/ocr";
import { fieldsFromOcr, ATTACHMENT_CONFIDENCE_CAP } from "./ocr-fields";
import type { ReceiptCategory } from "@/lib/types";

export type ScanFields = {
  merchant_name: string | null;
  total: number | null;
  currency: string;
  receipt_date: string | null;
  purchased_at: string | null;
  category: ReceiptCategory;
  tax_amount: number | null;
  tax_rate: number | null;
  seller_org_number: string | null;
  merchant_vat_number: string | null;
  vat_lines: unknown;
  payment_method: string | null;
  items: unknown;
  parse_confidence: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Null when the model says the picture isn't a receipt. `homeCurrency`
 * only fills the currency when nothing usable was read, on a receipt that
 * then waits for review anyway.
 */
export function scanFields(ocr: OcrResult, homeCurrency: string): ScanFields | null {
  if (ocr.not_a_receipt) return null;
  const full = fieldsFromOcr(ocr);
  if (full) {
    const date = full.purchased_at ? full.purchased_at.slice(0, 10) : null;
    return {
      merchant_name: full.merchant_name,
      total: full.total,
      currency: full.currency,
      receipt_date: date,
      purchased_at: full.purchased_at,
      category: (full.category ?? "other") as ReceiptCategory,
      tax_amount: full.tax_amount ?? null,
      tax_rate: full.tax_rate ?? null,
      seller_org_number: full.seller_org_number ?? null,
      merchant_vat_number: full.merchant_vat_number ?? null,
      vat_lines: full.vat_lines,
      payment_method: full.payment_method ?? null,
      items: full.items,
      parse_confidence: Math.min(full.parse_confidence, ATTACHMENT_CONFIDENCE_CAP),
    };
  }

  // Partly read: keep each field that is valid on its own.
  const merchant = typeof ocr.merchant === "string" ? ocr.merchant.trim().slice(0, 200) : "";
  const total = typeof ocr.amount === "number" && Number.isFinite(ocr.amount) && ocr.amount > 0 ? ocr.amount : null;
  const date = typeof ocr.receipt_date === "string" && DATE_RE.test(ocr.receipt_date) ? ocr.receipt_date : null;
  const currency =
    typeof ocr.currency === "string" && (CURRENCY_OPTIONS as readonly string[]).includes(ocr.currency)
      ? ocr.currency
      : homeCurrency;
  const category =
    typeof ocr.category === "string" && (CATEGORY_KEYS as readonly string[]).includes(ocr.category)
      ? (ocr.category as ReceiptCategory)
      : "other";
  return {
    merchant_name: merchant || null,
    total,
    currency,
    receipt_date: date,
    purchased_at: date ? `${date}T12:00:00.000Z` : null,
    category,
    tax_amount: null,
    tax_rate: null,
    seller_org_number: null,
    merchant_vat_number: null,
    vat_lines: null,
    payment_method: null,
    items: null,
    parse_confidence: Math.min(
      typeof ocr.confidence === "number" && Number.isFinite(ocr.confidence) ? ocr.confidence : 0.5,
      ATTACHMENT_CONFIDENCE_CAP
    ),
  };
}

/** Same merchant (ignoring case and spacing), amount and day as another receipt. */
export function looksLikeSameReceipt(
  a: { merchant_name: string | null; total: number | null; receipt_date: string | null },
  b: { merchant_name: string | null; total: number | null; receipt_date: string | null }
): boolean {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return (
    a.total != null &&
    b.total != null &&
    Math.abs(a.total - b.total) < 0.005 &&
    a.receipt_date != null &&
    a.receipt_date === b.receipt_date &&
    norm(a.merchant_name) !== "" &&
    norm(a.merchant_name) === norm(b.merchant_name)
  );
}
