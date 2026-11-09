// Dated rule values for the bookkeeping export. One place, so a change of
// law is a one-line edit with its source next to it. Sources are listed
// so the pilot accountant can check them; "UNVERIFIED" marks values typed
// from memory that still need a look at the primary source.
//
// Mervärdesskattelagen (2023:200) 9 kap. — Swedish VAT rates, in force
// 2026-11-04: 25 % standard, 12 % food/hotel/restaurant, 6 % books,
// transport, culture. (The 2026-04-01 → 2027-12-31 food 6 % window from
// the launch plan is NOT applied here: this module only recognises printed
// rates, it never decides what rate a purchase should carry.)
export const SWEDISH_VAT_RATES = [25, 12, 6] as const;

// A printed net and VAT that fit a Swedish rate within this many
// percentage points are taken as that rate. Rounding to öre on a net of a
// few kronor moves the implied rate by well under 0.3 pp.
export const VAT_RATE_TOLERANCE_PP = 0.3;

// A stored split must add up to the receipt's VAT amount within this
// (öre rounding across lines).
export const VAT_SPLIT_TOLERANCE = 0.05;

// Only a SEK receipt can carry Swedish input VAT (ingående moms, 2640).
// Foreign VAT is never deductible in the Swedish VAT return; it is
// refunded, if at all, through the EU refund procedure (ML 2023:200
// 14 kap., UNVERIFIED paragraph). bookkeeping.csv therefore leaves the VAT
// account blank for any other currency.
export const INPUT_VAT_CURRENCY = "SEK";

// Representation meals: no income-tax deduction since 2017-01-01 (IL
// 16 kap. 2 §, SFS 2016:1055); VAT deductible only on 300 kr per person
// (Skatteverket, "Avdrag för moms vid representation", UNVERIFIED). The
// export therefore suggests the non-deductible account and no VAT
// account; the accountant splits it (plan action 65 will compute it).
export const REPRESENTATION_VAT_BASE_PER_PERSON_SEK = 300;

// Untrusted extractions (attachments, LLM-only email text) are capped
// below the review threshold in src/lib/receipts/status.ts (0.75), so a
// person always confirms them before they can be exported as verified.
export const UNTRUSTED_EXTRACTION_CONFIDENCE_CAP = 0.7;

// ─── Foreign currency (2026-11-05, src/lib/fx.ts) ──────────────────────────
//
// A foreign receipt is converted into the company's currency at the
// spot rate of the transaction day (BFNAR 2013:2 p. 2.4); an approximate
// rate is allowed when it doesn't deviate much (p. 2.5). We use the ECB
// euro reference rate of the purchase day, crossing through the euro for
// two non-euro currencies, as in Skatteverket's ställningstagande
// 2013-02-27 (VAT conversion). Sources read via FAR Online summaries,
// UNVERIFIED against bfn.se / skatteverket.se. The ECB publishes the rates
// "for information purposes only" (UNVERIFIED): a card purchase is
// settled at the issuer's rate, so the bank-statement amount, typed in by
// the client (the receipt's owner; the firm portal can't set it), always
// wins over the ECB estimate, and the export keeps the two in separate
// columns.
export const FX_RATE_SOURCE = "ECB euro reference rate";

// The ECB publishes on banking days around 16:00 CET; a weekend or holiday
// purchase uses the last rate before it. A gap longer than this means the
// rate is missing, not a holiday (product choice, no legal source).
export const FX_MAX_RATE_AGE_DAYS = 7;

// Currencies we convert between: the euro (the ECB's base) plus the
// receipt and company currencies we support and the neighbours a Nordic
// company meets. Rates for the others are not cached, so a receipt in any
// other currency gets no ECB estimate (product choice, no legal source).
// The firm export README lists these by hand; a test keeps it in step.
export const FX_CONVERTED_CURRENCIES = ["EUR", "SEK", "USD", "GBP", "NOK", "DKK", "CHF", "PLN"] as const;

// First day of ECB reference rates; nothing earlier can be converted.
export const FX_FIRST_RATE_DATE = "1999-01-04";

// Default company currency by country (organizations.currency); the
// company can change it in Settings.
export const DEFAULT_CURRENCY_BY_COUNTRY: Record<string, string> = { SE: "SEK", FR: "EUR" };
