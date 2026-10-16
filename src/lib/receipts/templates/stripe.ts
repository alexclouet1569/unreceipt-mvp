// Stripe receipt email template — matches both Stripe's own platform
// receipts and merchant receipts sent via Stripe (subject typically
// "Your receipt from <Brand> [#1234-5678]"). DKIM-verified senders end
// in stripe.com.

import type { EmailTemplate, PartialFields } from "./types";
import {
  AMOUNT_PATTERN,
  currencyFromSymbol,
  isFromDomain,
  parseAmount,
  stripHtml,
} from "./amount";

// "Your receipt from Linear #2794-5305" or "… [#1234-5678]" → "Linear".
const SUBJECT_RE = /receipt from\s+(.+?)(?:\s+\[?#[A-Z0-9-]+\]?)?$/i;
const AMOUNT_LINE_RE = new RegExp(
  String.raw`(?:amount\s+paid|total)\s*[:\s]\s*([A-Z]{3}|\$|€|kr|SEK)?\s*(${AMOUNT_PATTERN})\s*([A-Z]{3}|\$|€|kr|SEK)?`,
  "i"
);
// "14 Oct 2026" (en-GB) or "Oct 14, 2026" (en-US).
const DATE_RE =
  /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i;
const US_DATE_RE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i;
const CARD_RE = /(?:•{2,}|\.{2,}|x{4,}|\*{4,})\s*(\d{4})/;

export const stripeTemplate: EmailTemplate = {
  name: "stripe",
  // Merchants sending through Stripe from their own domain still match (by
  // subject + body), but only mail from stripe.com can be trusted as-is.
  trustedDomains: ["stripe.com"],

  match(raw) {
    // Match the sender's domain exactly: `includes("@stripe.com")` also
    // matched look-alikes such as x@stripe.com.evil.example.
    if (isFromDomain(raw.from, this.trustedDomains)) {
      return true;
    }
    // Defensive: merchants can configure their own from-address. Fall
    // back to subject heuristic + body fingerprint.
    if (/receipt from\b/i.test(raw.subject)) {
      const body = (raw.text ?? raw.html ?? "").toLowerCase();
      return body.includes("powered by stripe") || body.includes("stripe.com");
    }
    return false;
  },

  extract(raw) {
    const text = stripHtml(raw.text ?? raw.html ?? "");
    // No default currency: guessing USD turned "1 250,00 kr" into 1 USD.
    const fields: PartialFields = {};

    const subjectMerchant = raw.subject.match(SUBJECT_RE);
    if (subjectMerchant) {
      fields.merchant_name = subjectMerchant[1].trim();
    }

    const amountMatch = text.match(AMOUNT_LINE_RE);
    if (amountMatch) {
      const amount = parseAmount(amountMatch[2]);
      if (amount != null) fields.total = amount;
      const currency = currencyFromSymbol(amountMatch[1] ?? amountMatch[3] ?? "");
      if (currency) fields.currency = currency;
    }

    const dateMatch = text.match(DATE_RE);
    const usDateMatch = dateMatch ? null : text.match(US_DATE_RE);
    const iso = dateMatch
      ? toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3])
      : usDateMatch
        ? toIsoDate(usDateMatch[2], usDateMatch[1], usDateMatch[3])
        : null;
    if (iso) fields.purchased_at = `${iso}T12:00:00.000Z`;

    const cardMatch = text.match(CARD_RE);
    if (cardMatch) {
      fields.card_last_four = cardMatch[1];
      fields.payment_method = "card";
    }

    return fields;
  },
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toIsoDate(d: string, m: string, y: string): string | null {
  const mm = MONTHS[m.toLowerCase().slice(0, 3)];
  if (!mm) return null;
  const dd = d.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

