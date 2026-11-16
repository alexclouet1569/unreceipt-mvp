import type { Metadata } from "next";
import { getFaq, type FaqItem } from "@/lib/faq";
import { LOCALE_HOME, type Locale } from "@/lib/locale";
import { MARKETING_PAGES, pageLanguages, pagePath, type MarketingPageId } from "@/lib/marketing-pages";
import { PLANS } from "@/lib/plans";
import { SHOW_PRICES } from "@/lib/pricing-visibility";

/**
 * Search-engine and AI-assistant facing facts about UnReceipt. Every claim
 * here must match what the product does today. Prices come from plans.ts,
 * FAQ answers from faq.ts.
 */

export const SITE_URL = "https://unreceipt.com";

// Search snippets: who it's for first (small businesses, freelancers and
// accounting firms), then what it does. Google shows ~155 characters of a
// description, so the important words come early.

export const TITLE = "Receipt App for Small Businesses & Accountants | UnReceipt";

export const DESCRIPTION =
  "Receipts done the moment you pay. Snap, forward or auto-collect receipts for you and your team; each is read in seconds, VAT included, and your accountant has it, free for them. For small businesses and freelancers.";

export const SHARE_DESCRIPTION =
  "Every receipt, done the moment you pay: snap, forward or connect your inbox, and each one is read in seconds, VAT included, and already with your accountant.";

export const SV_TITLE = "Kvittohantering för småföretag och redovisningsbyråer | UnReceipt";

export const SV_DESCRIPTION =
  "Kvitton klara när du betalar. Fota, vidarebefordra eller hämta in kvitton automatiskt, dina och teamets; varje kvitto läses av på sekunder, med momsen, och din redovisningsbyrå har det, gratis för byrån. För småföretag och enskild firma.";

export const SV_SHARE_DESCRIPTION =
  "Varje kvitto, klart när du betalar: fota, vidarebefordra eller koppla inkorgen, så läses det av på sekunder, med momsen, och finns redan hos din redovisare.";

export const FR_TITLE = "Gestion des justificatifs pour TPE et experts-comptables | UnReceipt";

export const FR_DESCRIPTION =
  "Vos reçus réglés dès que vous payez. Photographiez, transférez ou laissez arriver vos reçus et ceux de votre équipe\u00a0: chacun est lu en quelques secondes, TVA comprise, et votre expert-comptable l’a déjà, gratuitement. Pour TPE et indépendants.";

export const FR_SHARE_DESCRIPTION =
  "Chaque reçu, réglé dès que vous payez\u00a0: photographiez, transférez ou connectez votre boîte mail, et il est lu en quelques secondes, TVA comprise, déjà chez votre comptable.";

/** Open Graph locale per site language. */
const OG_LOCALE: Record<Locale, string> = { en: "en_US", sv: "sv_SE", fr: "fr_FR" };

/** The shared social card (src/app/opengraph-image.tsx). */
const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "UnReceipt — VAT-ready receipts for small businesses and their accountants.",
};

/**
 * JSON-LD serialised for a <script> tag. `<` is escaped so no copy edit
 * (a "</script>" in an FAQ answer) can ever close the tag early.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Absolute URL of a marketing path. */
export function absoluteUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

/**
 * Full metadata for a marketing page: title, description, canonical,
 * hreflang, Open Graph and Twitter card. Every marketing page goes through
 * this so none of them loses its share image: Next merges metadata
 * shallowly, so a page that sets `openGraph` replaces the layout's whole
 * `openGraph`, image included.
 */
export function marketingMetadata(opts: {
  page: MarketingPageId;
  locale: Locale;
  title: string;
  description: string;
  shareTitle?: string;
  shareDescription?: string;
  keywords?: string[];
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata {
  const path = pagePath(opts.page, opts.locale);
  const shareTitle = opts.shareTitle ?? opts.title;
  const shareDescription = opts.shareDescription ?? opts.description;
  const languages = pageLanguages(opts.page);
  return {
    title: { absolute: opts.title },
    description: opts.description,
    ...(opts.keywords ? { keywords: opts.keywords } : {}),
    alternates: { canonical: path, ...(languages ? { languages } : {}) },
    openGraph: {
      type: opts.type ?? "website",
      locale: OG_LOCALE[opts.locale],
      url: absoluteUrl(path),
      siteName: "UnReceipt",
      title: shareTitle,
      description: shareDescription,
      images: [OG_IMAGE],
      ...(opts.type === "article"
        ? { publishedTime: opts.publishedTime, modifiedTime: opts.modifiedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      images: [OG_IMAGE.url],
    },
  };
}

/**
 * hreflang alternates shared by every language's landing page, so each
 * page points at all the others and at the English default.
 */
export const LANDING_LANGUAGES = pageLanguages("home")!;

const OFFER_TEXT: Record<Locale, (receipts: number) => string> = {
  en: (n) => `Up to ${n} receipts per month for the whole company`,
  sv: (n) => `Upp till ${n} kvitton per månad för hela företaget`,
  fr: (n) => `Jusqu’à ${n} reçus par mois pour toute l’entreprise`,
};

const PILOT_OFFER: Record<Locale, string> = {
  en: "Free during the pilot",
  sv: "Gratis under piloten",
  fr: "Gratuit pendant la phase pilote",
};

const PAGE_DESCRIPTION: Record<Locale, string> = {
  en: DESCRIPTION,
  sv: SV_DESCRIPTION,
  fr: FR_DESCRIPTION,
};

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const SOFTWARE_ID = `${SITE_URL}/#software`;

/** Who UnReceipt is for, in schema.org Audience terms. */
const AUDIENCES = [
  "Small and medium-sized businesses",
  "Freelancers and sole traders",
  "Accounting firms and bookkeepers",
];

function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "UnReceipt",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512`,
    email: "support@unreceipt.com",
    areaServed: ["SE", "FR"],
    knowsLanguage: ["en", "sv", "fr"],
  };
}

function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "UnReceipt",
    url: SITE_URL,
    inLanguage: ["en", "sv", "fr"],
    publisher: { "@id": ORGANIZATION_ID },
  };
}

function faqNode(url: string, locale: Locale, faq: FaqItem[]) {
  return {
    "@type": "FAQPage",
    url,
    inLanguage: locale,
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

function breadcrumbNode(locale: Locale, trail: { name: string; path: string }[]) {
  const items = [{ name: "UnReceipt", path: LOCALE_HOME[locale] }, ...trail];
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** JSON-LD for a landing page: organization, site, product and FAQ. */
export function landingJsonLd(pilotMode: boolean, locale: Locale = "en", showPrices: boolean = SHOW_PRICES) {
  const pageUrl = absoluteUrl(LOCALE_HOME[locale]);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      websiteNode(),
      {
        "@type": "SoftwareApplication",
        "@id": SOFTWARE_ID,
        name: "UnReceipt",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Receipt management",
        operatingSystem: "Web, iOS",
        description: PAGE_DESCRIPTION[locale],
        url: pageUrl,
        inLanguage: locale,
        publisher: { "@id": ORGANIZATION_ID },
        audience: AUDIENCES.map((audienceType) => ({ "@type": "BusinessAudience", audienceType })),
        featureList: FEATURES[locale],
        // Prices hidden (pricing-visibility.ts): only the pilot's free
        // offer, which is computed from PILOT_MODE so it can't go stale.
        // Swedish visitors see SEK; English and French visitors see EUR.
        ...(!showPrices
          ? pilotMode
            ? { offers: { "@type": "Offer", price: "0", priceCurrency: locale === "sv" ? "SEK" : "EUR", description: PILOT_OFFER[locale] } }
            : {}
          : { offers: PLANS.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: (locale === "sv" ? plan.priceSek : plan.price).toFixed(2),
          priceCurrency: locale === "sv" ? "SEK" : "EUR",
          description: OFFER_TEXT[locale](plan.receipts),
        })) }),
      },
      faqNode(pageUrl, locale, getFaq(pilotMode, locale, showPrices)),
    ],
  };
}

/** Feature list for the SoftwareApplication node; true of the product today. */
const FEATURES: Record<Locale, string[]> = {
  en: [
    "Personal email address for forwarded receipts, and Gmail or Outlook connection",
    "Photo capture with automatic field extraction, in the iPhone app or the browser",
    "VAT amount and rate recorded when the receipt shows them",
    "Receipts read in seconds; uncertain ones confirmed by the user or accountant",
    "Foreign-currency receipts converted at the ECB reference rate",
    "Employee receipts sent for approval",
    "Free portal for the company's accountant: review, bank-statement check, weekly reminders and monthly export",
    "ZIP export with CSV, PDFs and original files",
  ],
  sv: [
    "Egen e-postadress för vidarebefordrade kvitton, och koppling till Gmail eller Outlook",
    "Fota kvitton i iPhone-appen eller webbläsaren, fälten fylls i automatiskt",
    "Momsbelopp och momssats när kvittot visar dem",
    "Kvitton avlästa på sekunder; osäkra bekräftas av användaren eller byrån",
    "Utländska kvitton räknas om med ECB:s referenskurs",
    "Anställdas kvitton skickas för godkännande",
    "Gratis portal för företagets redovisningsbyrå: granskning, avstämning mot kontoutdrag, påminnelser varje vecka och månadsexport med BAS-kontoförslag",
    "ZIP-export med CSV, PDF:er och originalfiler",
  ],
  fr: [
    "Adresse e-mail personnelle pour les reçus transférés, et connexion Gmail ou Outlook",
    "Photo des tickets dans l’app iPhone ou le navigateur, avec remplissage automatique",
    "Montant et taux de TVA relevés quand le justificatif les indique",
    "Reçus lus en quelques secondes ; les incertains confirmés par l’utilisateur ou le cabinet",
    "Reçus en devises convertis au taux de référence de la BCE",
    "Reçus des salariés envoyés pour validation",
    "Portail gratuit pour l’expert-comptable de l’entreprise : revue, rapprochement du relevé bancaire, rappels hebdomadaires et export mensuel",
    "Export ZIP avec CSV, PDF et fichiers d’origine",
  ],
};

/** JSON-LD for an audience page (accountants, freelancers). */
export function audienceJsonLd(opts: {
  page: MarketingPageId;
  locale: Locale;
  name: string;
  description: string;
  breadcrumb: string;
  audienceType: string;
  faq: FaqItem[];
}) {
  const path = pagePath(opts.page, opts.locale);
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      websiteNode(),
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: opts.name,
        description: opts.description,
        inLanguage: opts.locale,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": SOFTWARE_ID },
        audience: { "@type": "BusinessAudience", audienceType: opts.audienceType },
        dateModified: MARKETING_PAGES[opts.page].lastModified,
      },
      breadcrumbNode(opts.locale, [{ name: opts.breadcrumb, path }]),
      faqNode(url, opts.locale, opts.faq),
    ],
  };
}

/**
 * JSON-LD for the "About UnReceipt" fact sheet: an AboutPage whose main
 * entity is the organisation, with the product and the facts as Q&A.
 */
export function aboutJsonLd(opts: {
  locale: Locale;
  name: string;
  description: string;
  breadcrumb: string;
  summary: string;
  asOf: string;
  facts: { label: string; value: string }[];
}) {
  const path = pagePath("about", opts.locale);
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...organizationNode(), description: opts.summary },
      websiteNode(),
      {
        "@type": "AboutPage",
        "@id": `${url}#webpage`,
        url,
        name: opts.name,
        description: opts.description,
        inLanguage: opts.locale,
        isPartOf: { "@id": WEBSITE_ID },
        mainEntity: { "@id": ORGANIZATION_ID },
        about: { "@id": SOFTWARE_ID },
        dateModified: opts.asOf,
      },
      breadcrumbNode(opts.locale, [{ name: opts.breadcrumb, path }]),
      faqNode(
        url,
        opts.locale,
        opts.facts.map((f) => ({ q: f.label, a: f.value }))
      ),
    ],
  };
}

/** JSON-LD for a guide: Article, breadcrumbs and its FAQ. */
export function guideJsonLd(opts: {
  page: MarketingPageId;
  locale: Locale;
  headline: string;
  description: string;
  breadcrumb: string;
  published: string;
  updated: string;
  faq: FaqItem[];
}) {
  const path = pagePath(opts.page, opts.locale);
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      websiteNode(),
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: opts.headline,
        description: opts.description,
        inLanguage: opts.locale,
        url,
        mainEntityOfPage: url,
        datePublished: opts.published,
        dateModified: opts.updated,
        author: { "@id": ORGANIZATION_ID },
        publisher: { "@id": ORGANIZATION_ID },
        isPartOf: { "@id": WEBSITE_ID },
        image: absoluteUrl("/opengraph-image"),
      },
      // Guides have no index page yet; the trail is home → guide.
      breadcrumbNode(opts.locale, [{ name: opts.breadcrumb, path }]),
      ...(opts.faq.length ? [faqNode(url, opts.locale, opts.faq)] : []),
    ],
  };
}
