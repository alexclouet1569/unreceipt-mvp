import { getFaq } from "@/lib/faq";
import { LOCALE_HOME, type Locale } from "@/lib/locale";
import { PLANS } from "@/lib/plans";

/**
 * Search-engine and AI-assistant facing facts about UnReceipt. Every claim
 * here must match what the product does today. Prices come from plans.ts,
 * FAQ answers from faq.ts.
 */

export const SITE_URL = "https://unreceipt.com";

export const DESCRIPTION =
  "Forward email receipts or snap paper ones. UnReceipt turns every receipt into a VAT-ready record within 24 hours — merchant, line items, VAT and category. Built for small businesses in Sweden. Plans from €5.99/month.";

export const SHARE_DESCRIPTION =
  "Forward any receipt — email or photo — and get a VAT-ready record within 24 hours. Built for small businesses in Sweden.";

export const SV_TITLE = "UnReceipt — Kvittohantering för småföretag";

export const SV_DESCRIPTION = `Vidarebefordra e-postkvitton eller fota papperskvitton. UnReceipt gör varje kvitto till ett kontrollerat underlag inom 24 timmar — säljare, rader, moms och kategori. Byggt för småföretag i Sverige. Från ${PLANS[0].priceSek} kr/mån.`;

export const SV_SHARE_DESCRIPTION =
  "Skicka vilket kvitto som helst — mejl eller foto — och få ett kontrollerat underlag inom 24 timmar. Byggt för småföretag i Sverige.";

/**
 * hreflang alternates shared by every language's landing page, so each
 * page points at all the others and at the English default.
 */
export const LANDING_LANGUAGES = {
  en: LOCALE_HOME.en,
  sv: LOCALE_HOME.sv,
  "x-default": LOCALE_HOME.en,
};

/** JSON-LD for a landing page: organization, site, product and FAQ. */
export function landingJsonLd(pilotMode: boolean, locale: Locale = "en") {
  const sv = locale === "sv";
  const pageUrl = sv ? `${SITE_URL}${LOCALE_HOME.sv}` : SITE_URL;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "UnReceipt",
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512`,
        email: "support@unreceipt.com",
        areaServed: "SE",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "UnReceipt",
        url: SITE_URL,
        inLanguage: ["en", "sv"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: "UnReceipt",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: sv ? SV_DESCRIPTION : DESCRIPTION,
        url: pageUrl,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: PLANS.map((plan) =>
          sv
            ? {
                "@type": "Offer",
                name: plan.name,
                price: plan.priceSek.toFixed(2),
                priceCurrency: "SEK",
                description: `Upp till ${plan.receipts} kvitton per månad för hela företaget`,
              }
            : {
                "@type": "Offer",
                name: plan.name,
                price: plan.price.toFixed(2),
                priceCurrency: "EUR",
                description: `Up to ${plan.receipts} receipts per month for the whole company`,
              }
        ),
      },
      {
        "@type": "FAQPage",
        url: pageUrl,
        inLanguage: locale,
        mainEntity: getFaq(pilotMode, locale).map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}
