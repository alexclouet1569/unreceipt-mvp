// SERVER-SIDE, pure. The receipt fields of an emailed attachment that OCR
// could only partly read (src/lib/receipts/scan-fields.ts keeps each field
// that is valid on its own), filled in from the email text where OCR read
// nothing. The attachment stays the receipt's original either way.
//
// Trust: both sources are untrusted extractions (anyone can email an
// alias), so the confidence stays capped below the review threshold and the
// receipt lands in Review needed, like any attachment read by OCR.

import type { OcrResult } from "@/lib/ocr";
import { CURRENCY_OPTIONS } from "@/lib/receipt-format";
import { ATTACHMENT_CONFIDENCE_CAP } from "@/lib/receipts/ocr-fields";
import type { CanonicalReceiptFields } from "@/lib/receipts/parser-types";
import { scanFields } from "@/lib/receipts/scan-fields";

export type PartialAttachmentFields = {
  merchant_name: string | null;
  purchased_at: string | null;
  receipt_date: string | null;
  total: number | null;
  currency: string;
  tax_amount: number | null;
  tax_rate: number | null;
  seller_org_number: string | null;
  merchant_vat_number: string | null;
  vat_lines: CanonicalReceiptFields["vat_lines"];
  payment_method: string | null;
  card_last_four: string | null;
  category: string;
  parse_confidence: number;
};

/**
 * What OCR read of an attachment it couldn't read in full (merchant, total,
 * date or currency missing). Null when the model says it isn't a receipt or
 * read none of merchant, amount and date: the email text is then the better
 * source and the message stays the original.
 */
export function partialAttachmentFields(
  ocr: OcrResult,
  homeCurrency: string
): PartialAttachmentFields | null {
  const read = scanFields(ocr, homeCurrency);
  if (!read) return null;
  const amountRead = typeof ocr.amount === "number" && Number.isFinite(ocr.amount);
  if (!read.merchant_name && read.total == null && !amountRead && !read.receipt_date) return null;
  return {
    merchant_name: read.merchant_name,
    purchased_at: read.purchased_at,
    receipt_date: read.receipt_date,
    total: read.total,
    currency: read.currency,
    tax_amount: read.tax_amount,
    tax_rate: read.tax_rate,
    seller_org_number: read.seller_org_number,
    merchant_vat_number: read.merchant_vat_number,
    vat_lines: null,
    payment_method: read.payment_method,
    card_last_four: null,
    category: read.category,
    parse_confidence: read.parse_confidence,
  };
}

/**
 * Fills what OCR didn't read from the email text's own complete reading,
 * never overwriting a value OCR read. The amount comes with its currency
 * as a pair, and only when OCR read no currency or the same one: 500 DKK
 * must not become 500 SEK.
 */
export function fillFromText(
  partial: PartialAttachmentFields,
  text: CanonicalReceiptFields | null,
  ocrCurrency: unknown
): PartialAttachmentFields {
  const out = { ...partial };
  out.parse_confidence = Math.max(0, Math.min(partial.parse_confidence, ATTACHMENT_CONFIDENCE_CAP));
  if (!text) return out;
  // Any currency OCR saw counts here, even one the app doesn't handle
  // (DKK): the text's amount in another currency is then not this one.
  const seenCurrency =
    typeof ocrCurrency === "string" && ocrCurrency.trim() !== "" ? ocrCurrency.trim().toUpperCase() : null;

  if (!out.merchant_name && text.merchant_name) out.merchant_name = text.merchant_name;
  if (!out.purchased_at && text.purchased_at) {
    out.purchased_at = text.purchased_at;
    out.receipt_date = text.purchased_at.slice(0, 10);
  }
  if (
    out.total == null &&
    text.total != null &&
    (seenCurrency == null || seenCurrency === text.currency) &&
    (CURRENCY_OPTIONS as readonly string[]).includes(text.currency)
  ) {
    out.total = text.total;
    out.currency = text.currency;
    // OCR's VAT needs an amount to be kept, so there is none here: take the
    // text's, which belongs to this amount.
    out.tax_amount = text.tax_amount ?? null;
    out.tax_rate = text.tax_rate ?? null;
    out.vat_lines = text.vat_lines ?? null;
  }
  if (out.category === "other" && text.category) out.category = text.category;
  if (!out.payment_method && text.payment_method) out.payment_method = text.payment_method;
  if (!out.card_last_four && text.card_last_four) out.card_last_four = text.card_last_four;
  if (!out.seller_org_number && text.seller_org_number) out.seller_org_number = text.seller_org_number;
  if (!out.merchant_vat_number && text.merchant_vat_number) out.merchant_vat_number = text.merchant_vat_number;
  out.parse_confidence = Math.min(out.parse_confidence, text.parse_confidence, ATTACHMENT_CONFIDENCE_CAP);
  return out;
}
