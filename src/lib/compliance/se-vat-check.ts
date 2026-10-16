/**
 * Swedish VAT check for one receipt: does what the receipt shows support a
 * VAT (moms) deduction for a Swedish company? It only looks at what was read
 * off the receipt, so a "missing" finding can also mean the reader missed
 * it; the wording says "we couldn't find" for that reason.
 *
 * Computed when a receipt is shown, never stored, so a rule change in
 * se-vat-rules.ts applies to every receipt at once.
 *
 * Not tax advice: whether a purchase is deductible at all (private use,
 * representation limits…) is for the customer's accountant. This check
 * covers the paperwork the deduction depends on.
 *
 * Pure — no I/O. Safe to import from any layer.
 */

import { SE_VAT_RULES, SE_VAT_SOURCES, type RuleSource } from "./se-vat-rules";

export type VatCheckInput = {
  total: number | null;
  currency: string | null;
  tax_amount: number | null;
  tax_rate: number | null;
  vat_breakdown?: Array<{ rate: number; vat_amount: number }> | null;
  merchant_vat_number?: string | null;
  merchant_org_number?: string | null;
  buyer_name?: string | null;
  buyer_address?: string | null;
};

export type VatFindingId =
  | "simplified_invoice_incomplete"
  | "full_invoice_needed"
  | "foreign_vat"
  | "unusual_rate";

export type VatFinding = {
  id: VatFindingId;
  /** "warning": the VAT deduction may be refused as it stands. */
  level: "warning" | "info";
  title: string;
  detail: string;
  source: RuleSource;
};

export type VatCheckResult =
  /** Not a Swedish VAT question (e.g. no VAT charged, or nothing to go on). */
  | { applies: false }
  | { applies: true; findings: VatFinding[] };

// EU member states' VAT number prefixes (Greece uses EL, not GR).
const EU_VAT_PREFIXES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "XI",
]);

function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Two-letter country prefix of a VAT number ("SE556677889901" → "SE"). */
export function vatNumberCountry(vatNumber: string | null | undefined): string | null {
  if (!present(vatNumber)) return null;
  const compact = vatNumber!.replace(/[\s.-]/g, "").toUpperCase();
  const match = /^([A-Z]{2})[0-9A-Z]{2,13}$/.exec(compact);
  return match && EU_VAT_PREFIXES.has(match[1]) ? match[1] : null;
}

function vatShown(r: VatCheckInput): boolean {
  return (
    r.tax_amount != null ||
    r.tax_rate != null ||
    (Array.isArray(r.vat_breakdown) && r.vat_breakdown.length > 0)
  );
}

function vatCharged(r: VatCheckInput): boolean | null {
  if (Array.isArray(r.vat_breakdown) && r.vat_breakdown.length > 0) {
    return r.vat_breakdown.some((b) => b.vat_amount > 0);
  }
  if (r.tax_amount != null) return r.tax_amount > 0;
  if (r.tax_rate != null) return r.tax_rate > 0;
  return null; // not shown on the receipt
}

function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function checkSwedishVat(r: VatCheckInput): VatCheckResult {
  const sellerCountry = vatNumberCountry(r.merchant_vat_number);
  const charged = vatCharged(r);

  // Nothing to deduct: VAT shown as zero.
  if (charged === false) return { applies: false };

  // Foreign VAT is never deductible in the Swedish return, whatever the
  // paperwork. A non-SE VAT number decides it; without one, VAT charged in
  // another currency very likely is foreign.
  const foreignByNumber = sellerCountry != null && sellerCountry !== "SE";
  const foreignByCurrency =
    sellerCountry == null && r.currency != null && r.currency !== "SEK" && charged === true;
  if (foreignByNumber || foreignByCurrency) {
    return {
      applies: true,
      findings: [
        {
          id: "foreign_vat",
          level: "info",
          title: foreignByNumber ? "Foreign VAT" : "Probably foreign VAT",
          detail:
            "Only Swedish VAT can be deducted in your Swedish VAT return. VAT paid in another EU country can be reclaimed from that country through Skatteverket’s e-service, by " +
            SE_VAT_RULES.foreignVatRefundDeadline +
            ".",
          source: SE_VAT_SOURCES.foreignVat,
        },
      ],
    };
  }

  // The 4,000 kr line is in kronor; other currencies from a Swedish seller
  // can't be placed against it without a rate of exchange.
  if (r.currency !== "SEK" || r.total == null) return { applies: false };

  const findings: VatFinding[] = [];
  const sellerIdShown = present(r.merchant_vat_number) || present(r.merchant_org_number);

  if (r.total <= SE_VAT_RULES.simplifiedInvoiceMaxSek) {
    const missing: string[] = [];
    if (!sellerIdShown) missing.push("the seller’s VAT or organisation number");
    if (!vatShown(r)) missing.push("the VAT amount or rate");
    if (missing.length > 0) {
      findings.push({
        id: "simplified_invoice_incomplete",
        level: "warning",
        title: "May not support a VAT deduction",
        detail: `A receipt up to ${SE_VAT_RULES.simplifiedInvoiceMaxSek.toLocaleString("en-US")} kr must show ${listOf(missing)}. We couldn’t find ${missing.length > 1 ? "them" : "it"} on this receipt. If it’s there, add it with Edit; if not, ask the seller for a receipt that shows it.`,
        source: SE_VAT_SOURCES.invoiceRules,
      });
    }
  } else {
    const missing: string[] = [];
    if (!present(r.merchant_vat_number)) missing.push("the seller’s VAT number");
    if (!present(r.buyer_name)) missing.push("your company’s name");
    if (!present(r.buyer_address)) missing.push("your company’s address");
    if (missing.length > 0) {
      findings.push({
        id: "full_invoice_needed",
        level: "warning",
        title: "Ask the seller for a full invoice",
        detail: `Above ${SE_VAT_RULES.simplifiedInvoiceMaxSek.toLocaleString("en-US")} kr including VAT, the VAT can only be deducted with a full invoice. We couldn’t find ${listOf(missing)} on this one.`,
        source: SE_VAT_SOURCES.invoiceRules,
      });
    }
  }

  const rates = [
    ...(r.tax_rate != null ? [r.tax_rate] : []),
    ...(Array.isArray(r.vat_breakdown) ? r.vat_breakdown.map((b) => b.rate) : []),
  ];
  const unusual = rates.filter(
    (rate) => !(SE_VAT_RULES.rates as readonly number[]).some((ok) => Math.abs(ok - rate) < 0.01),
  );
  if (unusual.length > 0) {
    findings.push({
      id: "unusual_rate",
      level: "info",
      title: "Unusual VAT rate",
      detail: `${unusual[0]} % isn’t a Swedish VAT rate (25, 12 or 6 %). Check the receipt; the rate may have been misread.`,
      source: SE_VAT_SOURCES.vatRates,
    });
  }

  return { applies: true, findings };
}
