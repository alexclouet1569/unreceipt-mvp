// Turns an OCR answer (src/lib/ocr.ts) into the canonical receipt fields
// the email intake inserts, the same shape the text parser returns. Pure.
//
// Trust: an attachment is whatever the sender attached, and the model's
// confidence is self-reported, so the result is capped below the review
// threshold like any untrusted LLM extraction (see parser.ts): the fields
// pre-fill the row, a person confirms it.

import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import type { OcrResult } from "@/lib/ocr";
import type { CanonicalReceiptFields } from "./parser-types";
import { usableItems, usableVatLines } from "./receipt-fields";
import { UNTRUSTED_EXTRACTION_CONFIDENCE_CAP } from "@/lib/bookkeeping/rules";
import { vatLinesConsistent } from "@/lib/bookkeeping/vat-lines";

export const ATTACHMENT_CONFIDENCE_CAP = UNTRUSTED_EXTRACTION_CONFIDENCE_CAP;

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Null when the model saw no receipt, couldn't read the required fields
 * (merchant, total, date) or read a currency the app doesn't handle; the
 * caller then falls back to the email text. The currency is never
 * derived: a Danish receipt must not become a SEK one.
 */
export function fieldsFromOcr(result: OcrResult): CanonicalReceiptFields | null {
  if (result.not_a_receipt) return null;
  const merchant = typeof result.merchant === "string" ? result.merchant.trim().slice(0, 200) : "";
  const total = finite(result.amount);
  const date =
    typeof result.receipt_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.receipt_date)
      ? result.receipt_date
      : null;
  if (!merchant || total == null || total <= 0 || !date) return null;

  if (
    typeof result.currency !== "string" ||
    !(CURRENCY_OPTIONS as readonly string[]).includes(result.currency)
  ) {
    return null;
  }
  const currency = result.currency;
  const category =
    typeof result.category === "string" && (CATEGORY_KEYS as readonly string[]).includes(result.category)
      ? result.category
      : null;
  const taxAmount = finite(result.tax_amount);
  const taxRate = finite(result.tax_rate);
  const confidence = finite(result.confidence) ?? 0.5;
  const items = usableItems(result.items);
  const safeTax = taxAmount != null && taxAmount >= 0 && taxAmount <= total ? taxAmount : null;
  const split = usableVatLines(result.vat_lines);
  // A split that doesn't add up to the VAT total is dropped, never stored.
  const vatLines = split && vatLinesConsistent(split, safeTax) ? split : null;

  return {
    merchant_name: merchant,
    purchased_at: `${date}T12:00:00.000Z`,
    total,
    currency,
    subtotal: null,
    tax_amount: safeTax,
    tax_rate: taxRate != null && taxRate >= 0 && taxRate <= 100 ? taxRate : null,
    seller_org_number:
      typeof result.seller_org_number === "string" ? result.seller_org_number.trim().slice(0, 20) || null : null,
    merchant_vat_number:
      typeof result.seller_vat_number === "string" ? result.seller_vat_number.trim().slice(0, 32) || null : null,
    vat_lines: vatLines,
    category,
    payment_method:
      typeof result.payment_method === "string" ? result.payment_method.trim().slice(0, 50) || null : null,
    card_last_four: null,
    notes: null,
    items: items
      ? items.map((it) => ({
          label: it.label,
          qty: it.qty ?? null,
          unit_amount: it.unit_amount ?? null,
          total_amount: it.total_amount,
        }))
      : null,
    parse_confidence: Math.min(Math.max(confidence, 0), ATTACHMENT_CONFIDENCE_CAP),
  };
}
