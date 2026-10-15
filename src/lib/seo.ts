import { getFaq } from "@/lib/faq";
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

/** JSON-LD for the landing page: organization, site, product and FAQ. */
export function landingJsonLd(pilotMode: boolean) {
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
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: "UnReceipt",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: DESCRIPTION,
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: PLANS.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: plan.price.toFixed(2),
          priceCurrency: "EUR",
          description: `Up to ${plan.receipts} receipts per month for the whole company`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: getFaq(pilotMode).map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}
