import type { Metadata } from "next";
import { FAQ_PAGE, getFaq, type FaqItem } from "@/lib/faq";
import { GUIDES_INDEX, guidesFor } from "@/lib/guides";
import { LOCALE_HOME, type Locale } from "@/lib/locale";
import { MARKETING_PAGES, pageLanguages, pagePath, type MarketingPageId } from "@/lib/marketing-pages";
import { PLANS } from "@/lib/plans";
import { SHOW_PRICES } from "@/lib/pricing-visibility";
import { LINKEDIN_URL } from "@/lib/support-contact";

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
  "Snap or forward any receipt. AI reads it into a VAT-ready record in seconds; you confirm it and your accountant sees it. For small businesses, freelancers and accounting firms.";

export const SHARE_DESCRIPTION =
  "Snap a receipt and AI reads it in seconds; email receipts arrive on their own. VAT-ready for small businesses, freelancers and their accountants.";

export const SV_TITLE = "Kvittohantering för småföretag och redovisningsbyråer | UnReceipt";

export const SV_DESCRIPTION =
  "Fota eller vidarebefordra kvitton. AI läser av varje kvitto på sekunder med momsen uppdelad, du bekräftar och redovisningsbyrån ser det. För småföretag, enskild firma och byråer.";

export const SV_SHARE_DESCRIPTION =
  "Fota kvittot så läser AI av det på några sekunder, och e-postkvittona kommer av sig själva — med momsen klar för din redovisningsbyrå.";

export const FR_TITLE = "Gestion des justificatifs pour TPE et experts-comptables | UnReceipt";

export const FR_DESCRIPTION =
  "Photographiez vos tickets ou transférez vos reçus par e-mail. L’IA les lit en quelques secondes, TVA relevée, vous confirmez et votre expert-comptable les voit. Pour TPE, indépendants et cabinets.";

export const FR_SHARE_DESCRIPTION =
  "Photographiez un ticket, l’IA le lit en quelques secondes\u00a0; vos reçus par e-mail arrivent tout seuls, TVA relevée pour votre expert-comptable.";

/** Open Graph locale per site language. */
const OG_LOCALE: Record<Locale, string> = { en: "en_US", sv: "sv_SE", fr: "fr_FR" };

/** The shared social card (src/app/opengraph-image.tsx). */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "UnReceipt — VAT-ready receipts for small businesses and their accountants.",
};

/**
 * A marketing page's own share image (`src/app/og/[card]/route.tsx`, drawn at
 * build time with the page's eyebrow and headline). `OG_IMAGE` stays the
 * site-wide default for pages outside MARKETING_PAGES (/privacy).
 */
export function shareImagePath(page: MarketingPageId, locale: Locale): string {
  return `/og/${page}-${locale}.png`;
}

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
  const image = { ...OG_IMAGE, url: shareImagePath(opts.page, opts.locale), alt: shareTitle };
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
      images: [image],
      ...(opts.type === "article"
        ? { publishedTime: opts.publishedTime, modifiedTime: opts.modifiedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      images: [image.url],
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

/**
 * UnReceipt's own profiles elsewhere (LinkedIn company page, Crunchbase…),
 * listed as `sameAs` on the Organization so search engines and AI
 * assistants tie them to this site. Only real, live profiles owned by
 * UnReceipt: the LinkedIn company page since 2026-11-19.
 */
export const SAME_AS: readonly string[] = [LINKEDIN_URL];

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "UnReceipt",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512`,
    email: "support@unreceipt.com",
    areaServed: ["SE", "FR"],
    knowsLanguage: ["en", "sv", "fr"],
    ...(SAME_AS.length ? { sameAs: [...SAME_AS] } : {}),
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

/** JSON-LD for a landing page: organization, site and product. The FAQ has its own page (faqPageJsonLd). */
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
    ],
  };
}

/** JSON-LD for the FAQ page: the FAQPage itself, mirroring the visible questions, and its breadcrumb. */
export function faqPageJsonLd(pilotMode: boolean, locale: Locale, showPrices: boolean = SHOW_PRICES) {
  const t = FAQ_PAGE[locale];
  const path = pagePath("faq", locale);
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      websiteNode(),
      {
        ...faqNode(url, locale, getFaq(pilotMode, locale, showPrices)),
        "@id": `${url}#webpage`,
        name: t.metaTitle,
        description: t.description,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": SOFTWARE_ID },
        dateModified: MARKETING_PAGES.faq.lastModified,
      },
      breadcrumbNode(locale, [{ name: t.breadcrumb, path }]),
    ],
  };
}

/** Feature list for the SoftwareApplication node; true of the product today. */
const FEATURES: Record<Locale, string[]> = {
  en: [
    "Private email address per company for forwarded receipts",
    "Photo capture with AI field extraction in seconds",
    "VAT amount and rate recorded for every receipt",
    "Email receipts read as they arrive, forwarded or from a connected Gmail or Outlook mailbox",
    "Foreign-currency receipts converted at the ECB reference rate",
    "Accounting-firm portal with per-client review and monthly export",
    "ZIP export with CSV, PDFs and original files",
  ],
  sv: [
    "Privat e-postadress per företag för vidarebefordrade kvitton",
    "Fota kvitton, AI fyller i fälten på några sekunder",
    "Momsbelopp och momssats för varje kvitto",
    "E-postkvitton läses av när de kommer, vidarebefordrade eller från en ansluten Gmail- eller Outlook-inkorg",
    "Utländska kvitton räknas om med ECB:s referenskurs",
    "Byråportal med granskning per klient och månadsexport med BAS-kontoförslag",
    "ZIP-export med CSV, PDF:er och originalfiler",
  ],
  fr: [
    "Adresse e-mail privée par entreprise pour les reçus transférés",
    "Photo des tickets, champs remplis par l’IA en quelques secondes",
    "Montant et taux de TVA relevés pour chaque reçu",
    "Reçus par e-mail lus dès leur arrivée, transférés ou depuis une boîte Gmail ou Outlook connectée",
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

/** JSON-LD for the demo request page: a ContactPage with its breadcrumb. */
export function demoPageJsonLd(opts: {
  locale: Locale;
  name: string;
  description: string;
  breadcrumb: string;
  /** The demo request page (default) or the contact page: both ContactPages. */
  page?: "bookDemo" | "contact";
}) {
  const page = opts.page ?? "bookDemo";
  const path = pagePath(page, opts.locale);
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      websiteNode(),
      {
        "@type": "ContactPage",
        "@id": `${url}#webpage`,
        url,
        name: opts.name,
        description: opts.description,
        inLanguage: opts.locale,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": SOFTWARE_ID },
        dateModified: MARKETING_PAGES[page].lastModified,
      },
      breadcrumbNode(opts.locale, [{ name: opts.breadcrumb, path }]),
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
        image: absoluteUrl(shareImagePath(opts.page, opts.locale)),
      },
      breadcrumbNode(opts.locale, [
        { name: GUIDES_INDEX[opts.locale].breadcrumb, path: pagePath("guides", opts.locale) },
        { name: opts.breadcrumb, path },
      ]),
      ...(opts.faq.length ? [faqNode(url, opts.locale, opts.faq)] : []),
    ],
  };
}

/** JSON-LD for a guides index: a collection page listing that language's guides. */
export function guidesIndexJsonLd(locale: Locale) {
  const t = GUIDES_INDEX[locale];
  const path = pagePath("guides", locale);
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      websiteNode(),
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        name: t.title,
        description: t.description,
        inLanguage: locale,
        url,
        isPartOf: { "@id": WEBSITE_ID },
        publisher: { "@id": ORGANIZATION_ID },
        dateModified: MARKETING_PAGES.guides.lastModified,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: guidesFor(locale).map((g, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: g.title,
            url: absoluteUrl(pagePath(g.page, locale)),
          })),
        },
      },
      breadcrumbNode(locale, [{ name: t.breadcrumb, path }]),
    ],
  };
}
