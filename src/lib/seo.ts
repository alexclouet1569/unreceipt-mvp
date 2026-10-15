import { getFaq } from "@/lib/faq";
import { LOCALE_HOME, type Locale } from "@/lib/locale";
import { PLANS, formatEurFr } from "@/lib/plans";

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

export const FR_TITLE = "UnReceipt — Gestion des reçus et justificatifs pour les petites entreprises";

export const FR_DESCRIPTION = `Transférez vos factures et reçus envoyés par e-mail ou photographiez vos tickets papier. UnReceipt transforme chaque reçu en fiche vérifiée sous 24 heures — fournisseur, lignes, TVA et catégorie. À partir de ${formatEurFr(PLANS[0].price)}\u00a0HT par mois.`;

export const FR_SHARE_DESCRIPTION =
  "Envoyez n’importe quel reçu — e-mail ou photo — et retrouvez-le vérifié sous 24 heures, avec sa TVA relevée.";

/**
 * hreflang alternates shared by every language's landing page, so each
 * page points at all the others and at the English default.
 */
export const LANDING_LANGUAGES = {
  en: LOCALE_HOME.en,
  sv: LOCALE_HOME.sv,
  fr: LOCALE_HOME.fr,
  "x-default": LOCALE_HOME.en,
};

const OFFER_TEXT: Record<Locale, (receipts: number) => string> = {
  en: (n) => `Up to ${n} receipts per month for the whole company`,
  sv: (n) => `Upp till ${n} kvitton per månad för hela företaget`,
  fr: (n) => `Jusqu’à ${n} reçus par mois pour toute l’entreprise`,
};

const PAGE_DESCRIPTION: Record<Locale, string> = {
  en: DESCRIPTION,
  sv: SV_DESCRIPTION,
  fr: FR_DESCRIPTION,
};

/** JSON-LD for a landing page: organization, site, product and FAQ. */
export function landingJsonLd(pilotMode: boolean, locale: Locale = "en") {
  const pageUrl = locale === "en" ? SITE_URL : `${SITE_URL}${LOCALE_HOME[locale]}`;
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
        areaServed: ["SE", "FR"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "UnReceipt",
        url: SITE_URL,
        inLanguage: ["en", "sv", "fr"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: "UnReceipt",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: PAGE_DESCRIPTION[locale],
        url: pageUrl,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#organization` },
        // Swedish visitors see SEK; English and French visitors see EUR.
        offers: PLANS.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: (locale === "sv" ? plan.priceSek : plan.price).toFixed(2),
          priceCurrency: locale === "sv" ? "SEK" : "EUR",
          description: OFFER_TEXT[locale](plan.receipts),
        })),
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
