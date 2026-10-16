/**
 * Where the customer's company is established, set in /app/settings. It
 * decides which country's VAT rules a receipt is checked against: only
 * Swedish companies get the Swedish VAT check, and an unknown country gets
 * none (a French company told "only Swedish VAT is deductible" would be
 * badly misled). Pure, safe to import anywhere.
 */

export const COMPANY_COUNTRIES = ["SE", "FR", "OTHER"] as const;
export type CompanyCountry = (typeof COMPANY_COUNTRIES)[number];

export const COMPANY_COUNTRY_LABELS: Record<CompanyCountry, string> = {
  SE: "Sweden",
  FR: "France",
  OTHER: "Another country",
};

export function parseCompanyCountry(value: unknown): CompanyCountry | null {
  return typeof value === "string" && (COMPANY_COUNTRIES as readonly string[]).includes(value)
    ? (value as CompanyCountry)
    : null;
}
