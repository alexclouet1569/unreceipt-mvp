import type { Metadata } from "next";
import { getFaq, type FaqItem } from "@/lib/faq";
import { LOCALE_HOME, type Locale } from "@/lib/locale";
import { MARKETING_PAGES, pageLanguages, pagePath, type MarketingPageId } from "@/lib/marketing-pages";
import { PLANS } from "@/lib/plans";

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
  "Snap or forward any receipt. UnReceipt turns it into a VAT-ready record within 24 hours, shared with your accountant. For small businesses, freelancers and accounting firms.";

export const SHARE_DESCRIPTION =
  "Snap or forward any receipt and get a VAT-ready record within 24 hours — for small businesses, freelancers and their accountants.";

export const SV_TITLE = "Kvittohantering för småföretag och redovisningsbyråer | UnReceipt";

export const SV_DESCRIPTION =
  "Fota eller vidarebefordra kvitton. UnReceipt gör varje kvitto till ett kontrollerat underlag med momsen uppdelad inom 24 timmar, redo för din redovisningsbyrå. För småföretag, enskild firma och byråer.";

export const SV_SHARE_DESCRIPTION =
  "Skicka vilket kvitto som helst — mejl eller foto — och få ett kontrollerat underlag inom 24 timmar, redo för din redovisningsbyrå.";

export const FR_TITLE = "Gestion des justificatifs pour TPE et experts-comptables | UnReceipt";

export const FR_DESCRIPTION =
  "Photographiez vos tickets ou transférez vos reçus par e-mail. UnReceipt en fait des justificatifs vérifiés sous 24 h, TVA relevée, prêts pour votre expert-comptable. Pour TPE, indépendants et cabinets.";

export const FR_SHARE_DESCRIPTION =
  "Envoyez n’importe quel reçu — e-mail ou photo — et retrouvez-le vérifié sous 24 heures, prêt pour votre expert-comptable.";

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
export function landingJsonLd(pilotMode: boolean, locale: Locale = "en") {
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
        // Swedish visitors see SEK; English and French visitors see EUR.
        offers: PLANS.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: (locale === "sv" ? plan.priceSek : plan.price).toFixed(2),
          priceCurrency: locale === "sv" ? "SEK" : "EUR",
          description: OFFER_TEXT[locale](plan.receipts),
        })),
      },
      faqNode(pageUrl, locale, getFaq(pilotMode, locale)),
    ],
  };
}

/** Feature list for the SoftwareApplication node; true of the product today. */
const FEATURES: Record<Locale, string[]> = {
  en: [
    "Private email address per company for forwarded receipts",
    "Photo capture with automatic field extraction",
    "VAT amount and rate recorded for every receipt",
    "Every receipt checked within 24 hours",
    "Foreign-currency receipts converted at the ECB reference rate",
    "Accounting-firm portal with per-client review and monthly export",
    "ZIP export with CSV, PDFs and original files",
  ],
  sv: [
    "Privat e-postadress per företag för vidarebefordrade kvitton",
    "Fota kvitton, fälten fylls i automatiskt",
    "Momsbelopp och momssats för varje kvitto",
    "Varje kvitto kontrolleras inom 24 timmar",
    "Utländska kvitton räknas om med ECB:s referenskurs",
    "Byråportal med granskning per klient och månadsexport med BAS-kontoförslag",
    "ZIP-export med CSV, PDF:er och originalfiler",
  ],
  fr: [
    "Adresse e-mail privée par entreprise pour les reçus transférés",
    "Photo des tickets avec remplissage automatique",
    "Montant et taux de TVA relevés pour chaque reçu",
    "Chaque reçu vérifié sous 24 heures",
    "Reçus en devises convertis au taux de référence de la BCE",
    "Portail cabinet avec revue par client et export mensuel",
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
