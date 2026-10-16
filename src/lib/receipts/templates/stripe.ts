// Stripe receipt email template — matches both Stripe's own platform
// receipts and merchant receipts sent via Stripe (subject typically
// "Your receipt from <Brand> [#1234-5678]"). DKIM-verified senders end
// in stripe.com.

import type { EmailTemplate, PartialFields } from "./types";
import {
  AMOUNT_PATTERN,
  CURRENCY_TOKEN,
  currencyAround,
  findDate,
  isFromDomain,
  parseAmount,
  stripHtml,
} from "./amount";

// "Your receipt from Linear #2794-5305" or "… [#1234-5678]" → "Linear".
// Bounded and single-line so a crafted subject can't backtrack for seconds.
const SUBJECT_RE = /receipt from[ \t]+([^\n]{1,200}?)(?:[ \t]+\[?#[A-Z0-9-]{1,40}\]?)?[ \t]*$/i;
const amountAfter = (label: string) =>
  new RegExp(
    String.raw`${label}[ \t]*[:]?\s*(${CURRENCY_TOKEN})?[ \t\u00a0]*(${AMOUNT_PATTERN})[ \t\u00a0]*(${CURRENCY_TOKEN})?`,
    "im"
  );
// "Amount paid" is what the card was charged. Only without it fall back to
// a line starting "Total" — never "Subtotal", "Total excluding tax" or
// "Total tax".
const AMOUNT_PAID_RE = amountAfter(String.raw`\bamount[ \t]+paid\b`);
const TOTAL_RE = amountAfter(String.raw`^[ \t]*total\b(?![ \t]+(?:excl|excluding|before|ex|tax|vat|moms)\b)`);
// Bounded: unbounded runs were quadratic on a body of dots (200 KB: 74 s).
const CARD_RE = /(?:•{2,8}|\.{2,8}|x{4,8}|\*{4,8})[ \t]{0,3}(\d{4})/;

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

    // First line only, capped: keeps SUBJECT_RE linear on crafted subjects.
    const subjectMerchant = raw.subject.split(/[\r\n\u2028\u2029]/)[0].slice(0, 300).match(SUBJECT_RE);
    if (subjectMerchant) {
      fields.merchant_name = subjectMerchant[1].trim();
    }

    const amountMatch = text.match(AMOUNT_PAID_RE) ?? text.match(TOTAL_RE);
    if (amountMatch) {
      const amount = parseAmount(amountMatch[2]);
      if (amount != null) fields.total = amount;
      const currency = currencyAround(amountMatch[1], amountMatch[3], text);
      if (currency) fields.currency = currency;
    }

    const iso = findDate(text);
    if (iso) fields.purchased_at = `${iso}T12:00:00.000Z`;

    const cardMatch = text.match(CARD_RE);
    if (cardMatch) {
      fields.card_last_four = cardMatch[1];
      fields.payment_method = "card";
    }

    return fields;
  },
};
