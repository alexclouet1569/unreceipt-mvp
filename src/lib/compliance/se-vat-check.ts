/**
 * Swedish VAT check for one receipt: does what the receipt shows give a
 * Swedish company the paperwork a VAT (moms) deduction needs? It only looks
 * at what was read off the receipt, so a "missing" finding can also mean
 * the reader missed it; the wording says "we couldn't find" for that reason.
 *
 * Runs only for companies established in Sweden (profiles.company_country):
 * for anyone else the Swedish rules would be wrong advice.
 *
 * Partial by design: it checks the seller's id, the VAT and (above
 * 4,000 kr) the buyer. It doesn't check the date, what was bought, the
 * invoice number or amounts per rate, and the all-clear says so.
 *
 * Computed when a receipt is shown or exported, never stored, so a rule
 * change in se-vat-rules.ts applies to every receipt at once.
 *
 * Not tax advice: whether a purchase is deductible at all (private use,
 * representation limits…) is for the customer's accountant.
 *
 * Pure — no I/O. Safe to import from any layer.
 */

import type { CompanyCountry } from "@/lib/company-country";
import { SE_VAT_RULES, SE_VAT_SOURCES, type RuleSource } from "./se-vat-rules";

export type VatCheckInput = {
  total: number | null;
  currency: string | null;
  tax_amount: number | null;
  tax_rate: number | null;
  tip_amount?: number | null;
  status?: string | null;
  vat_breakdown?: Array<{ rate: number; vat_amount: number }> | null;
  merchant_vat_number?: string | null;
  merchant_org_number?: string | null;
  buyer_name?: string | null;
  buyer_address?: string | null;
};

export type VatFindingId =
  | "simplified_invoice_incomplete"
  | "full_invoice_needed"
  | "no_vat_shown"
  | "foreign_vat"
  | "reverse_charge"
  | "unusual_rate";

export type VatFinding = {
  id: VatFindingId;
  /** "warning": Skatteverket may refuse the VAT deduction as it stands. */
  level: "warning" | "info";
  title: string;
  detail: string;
  source: RuleSource;
};

export type VatCheckResult =
  /** Not a Swedish VAT question here (other country, no VAT, other currency). */
  | { applies: false }
  | {
      applies: true;
      findings: VatFinding[];
      /**
       * When nothing is missing: what was found and what wasn't checked,
       * e.g. found "the seller's number and the VAT". Null with findings.
       */
      allClear: { found: string; notChecked: string; short: string; unconfirmed: boolean } | null;
    };

// EU member states' VAT number prefixes (Greece uses EL, not GR).
const EU_VAT_PREFIXES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "XI",
]);

const kr = (n: number) => `${n.toLocaleString("en-US")} kr`;

/**
 * A seller id worth the name: at least six digits once spaces and dashes
 * are gone. "N/A" or a stray word read as an id doesn't count.
 */
function looksLikeId(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return (value.match(/\d/g)?.length ?? 0) >= 6;
}

/** Two-letter country prefix of a VAT number ("SE556677889901" → "SE"). */
export function vatNumberCountry(vatNumber: string | null | undefined): string | null {
  if (typeof vatNumber !== "string" || vatNumber.trim() === "") return null;
  const compact = vatNumber.replace(/[\s.-]/g, "").toUpperCase();
  const match = /^([A-Z]{2})[0-9A-Z]{2,13}$/.exec(compact);
  return match && EU_VAT_PREFIXES.has(match[1]) ? match[1] : null;
}

/** Swedish organisation or personal number: 10 digits, "556677-8899". */
function looksSwedishOrgNumber(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return /^(\d{2})?\d{6}[-+]?\d{4}$/.test(value.replace(/\s/g, ""));
}

function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** true: VAT charged; false: shown as zero; null: no VAT shown at all. */
function vatCharged(r: VatCheckInput): boolean | null {
  if (Array.isArray(r.vat_breakdown) && r.vat_breakdown.length > 0) {
    return r.vat_breakdown.some((b) => b.vat_amount > 0);
  }
  if (r.tax_amount != null) return r.tax_amount > 0;
  if (r.tax_rate != null) return r.tax_rate > 0;
  return null;
}

function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function checkSwedishVat(
  r: VatCheckInput,
  companyCountry: CompanyCountry | null,
): VatCheckResult {
  if (companyCountry !== "SE") return { applies: false };

  const sellerCountry = vatNumberCountry(r.merchant_vat_number);
  const charged = vatCharged(r);

  // Shown as zero: nothing to deduct.
  if (charged === false) return { applies: false };

  // Seller with another EU country's VAT number.
  if (sellerCountry != null && sellerCountry !== "SE") {
    if (charged === true) {
      return {
        applies: true,
        allClear: null,
        findings: [foreignVat("Foreign VAT")],
      };
    }
    return {
      applies: true,
      allClear: null,
      findings: [
        {
          id: "reverse_charge",
          level: "info",
          title: "Probably reverse charge",
          detail:
            "No VAT on a purchase from a seller in another EU country usually means reverse charge: you report the Swedish VAT yourself, and if the purchase is for your VAT-liable business you can normally deduct it in the same return. Check how to book it with your accountant.",
          source: SE_VAT_SOURCES.reverseCharge,
        },
      ],
    };
  }

  // VAT charged in another currency, with nothing identifying a Swedish
  // seller: very likely foreign VAT.
  const swedishSeller = sellerCountry === "SE" || looksSwedishOrgNumber(r.merchant_org_number);
  if (!swedishSeller && r.currency != null && r.currency !== "SEK" && charged === true) {
    return { applies: true, allClear: null, findings: [foreignVat("Probably foreign VAT")] };
  }

  // The 4,000 kr line is in kronor; other currencies can't be placed
  // against it without a rate of exchange.
  if (r.currency !== "SEK" || r.total == null) return { applies: false };

  // A tip added at the card terminal isn't part of the invoice total.
  const invoiceTotal =
    r.tip_amount != null && r.tip_amount > 0 ? r.total - r.tip_amount : r.total;
  const limit = SE_VAT_RULES.simplifiedInvoiceMaxSek.value;
  const aboveLimit = invoiceTotal > limit;

  if (charged === null) {
    return {
      applies: true,
      allClear: null,
      findings: [
        {
          id: "no_vat_shown",
          level: "info",
          title: "No VAT found",
          detail: `We couldn’t find any VAT on this receipt. If the seller charged VAT, the receipt must show it for you to deduct it${
            aboveLimit ? `, and above ${kr(limit)} it should be a full invoice` : ""
          }. If the seller doesn’t charge VAT (for example an exempt service), there is nothing to deduct.`,
          source: SE_VAT_SOURCES.invoiceRules,
        },
      ],
    };
  }

  const findings: VatFinding[] = [];
  if (!aboveLimit) {
    if (!looksLikeId(r.merchant_vat_number) && !looksLikeId(r.merchant_org_number)) {
      findings.push({
        id: "simplified_invoice_incomplete",
        level: "warning",
        title: "Seller not identified",
        detail: `For the VAT to be deductible, a receipt up to ${kr(limit)} must show the seller’s VAT, organisation or personal number. We couldn’t find one on this receipt. If it’s there, add it with Edit; if not, ask the seller for a receipt that shows it.`,
        source: SE_VAT_SOURCES.invoiceRules,
      });
    }
  } else {
    const missing: string[] = [];
    // Another EU country's number has already left the check above, so a
    // VAT number here must be Swedish; an org.nr typed into it isn't one.
    if (!(sellerCountry === "SE" && looksLikeId(r.merchant_vat_number))) {
      missing.push("the seller’s VAT number");
    }
    if (!present(r.buyer_name)) missing.push("your company’s name");
    if (!present(r.buyer_address)) missing.push("your company’s address");
    if (missing.length > 0) {
      findings.push({
        id: "full_invoice_needed",
        level: "warning",
        title: "Ask the seller for a full invoice",
        detail: `Above ${kr(limit)} including VAT, Skatteverket may refuse the VAT deduction without a full invoice made out to your company. We couldn’t find ${listOf(missing)} on this one.`,
        source: SE_VAT_SOURCES.invoiceRules,
      });
    }
  }

  const rates =
    Array.isArray(r.vat_breakdown) && r.vat_breakdown.length > 0
      ? r.vat_breakdown.map((b) => b.rate)
      : r.tax_rate != null
        ? [r.tax_rate]
        : [];
  const unusual = [
    ...new Set(
      rates.filter(
        (rate) =>
          !(SE_VAT_RULES.rates as readonly number[]).some((ok) => Math.abs(ok - rate) < 0.01),
      ),
    ),
  ];
  if (unusual.length > 0) {
    findings.push({
      id: "unusual_rate",
      level: "info",
      title: "Unusual VAT rate",
      detail: `${listOf(unusual.map((u) => `${u} %`))} ${
        unusual.length > 1 ? "aren’t Swedish VAT rates" : "isn’t a Swedish VAT rate"
      } (25, 12 or 6 %). The rate may have been misread, or the receipt has several rates.`,
      source: SE_VAT_SOURCES.vatRates,
    });
  }

  const allClear =
    findings.length === 0
      ? {
          found: aboveLimit
            ? "the seller’s VAT number, your company’s name and address, and the VAT"
            : "the seller’s number and the VAT",
          notChecked: aboveLimit
            ? "the invoice number, the date, what was bought and the amounts per rate"
            : "the date and what was bought",
          short: aboveLimit ? "Seller VAT no., buyer and VAT found" : "Seller id and VAT found",
          unconfirmed: r.status === "pending_review",
        }
      : null;

  return { applies: true, findings, allClear };
}

function foreignVat(title: string): VatFinding {
  return {
    id: "foreign_vat",
    level: "info",
    title,
    detail: `Only Swedish VAT can be deducted in your Swedish VAT return. VAT paid in another EU country may be reclaimable from that country through Skatteverket’s e-service, by ${SE_VAT_RULES.foreignVatRefundDeadline}; minimum amounts apply.`,
    source: SE_VAT_SOURCES.foreignVat,
  };
}

/**
 * The check in one spreadsheet cell, for the accountant: what was found,
 * the findings' titles, or empty when the check doesn't apply.
 */
export function vatCheckSummary(
  r: VatCheckInput,
  companyCountry: CompanyCountry | null,
): string {
  const result = checkSwedishVat(r, companyCountry);
  if (!result.applies) return "";
  if (result.allClear) {
    const { short, unconfirmed } = result.allClear;
    return unconfirmed ? `${short} (unconfirmed)` : short;
  }
  return result.findings.map((f) => f.title).join("; ");
}
