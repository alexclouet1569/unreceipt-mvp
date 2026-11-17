// The link to unreceipt.com in every transactional email's footer
// (templates.ts layout()). Swedish companies get the Swedish site, everyone
// else the English one. The URL holds constants and the email's flow only:
// never anything about the recipient (address, name, company, ids).
// Pure: imported by the templates and by every sender.

import { guessCountry } from "@/lib/country";
import type { EmailTag } from "./tags";

export type SiteLocale = "sv" | "en";

const SITE_ORIGIN = "https://unreceipt.com";

/**
 * Which site the footer links to. The recipient company's (or user's)
 * country when known; otherwise the country of the address's domain
 * (".se"), and the English site when nothing says Sweden.
 */
export function emailSiteLocale(hints: { country?: string | null; email?: string | null }): SiteLocale {
  const country = hints.country?.trim().toUpperCase() || guessCountry({ email: hints.email ?? null });
  return country === "SE" ? "sv" : "en";
}

/** unreceipt.com (or /sv) tagged as a transactional email of this flow. */
export function emailSiteUrl(locale: SiteLocale, campaign: EmailTag): string {
  const params = new URLSearchParams({
    utm_source: "email",
    utm_medium: "transactional",
    utm_campaign: campaign,
  });
  return `${SITE_ORIGIN}${locale === "sv" ? "/sv" : "/"}?${params.toString()}`;
}
