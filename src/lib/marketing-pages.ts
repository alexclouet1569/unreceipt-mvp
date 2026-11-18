import type { Locale } from "@/lib/locale";

/**
 * Every public marketing page on unreceipt.com, with its path in each
 * language it exists in. One list for the sitemap, the hreflang tags, the
 * footer links and the apex/app host split in src/lib/host-proxy.ts, so a new page
 * can't be published in one place and forgotten in another.
 *
 * Paths are in the page's own language (`/sv/redovisningsbyra`, not
 * `/sv/accountants`): the slug is one of the words people search for.
 *
 * `translated: true` means the language versions are the same page in
 * another language, so they point at each other with hreflang. Guides are
 * written per country (Swedish law on /sv, French law on /fr) and are not
 * translations of each other, so they carry no hreflang alternates.
 *
 * Pure data, safe to import from client components and the proxy.
 */

export type MarketingPageId =
  | "home"
  | "accountants"
  | "freelancers"
  | "smallBusiness"
  | "about"
  | "guides"
  | "bookDemo"
  | "guideRetention"
  | "guidePaper"
  | "guideOutlays";

export type MarketingPage = {
  paths: Partial<Record<Locale, string>>;
  translated: boolean;
  /** Last date the visible content changed. Bump it with the content. */
  lastModified: string;
  priority: number;
};

export const MARKETING_PAGES: Record<MarketingPageId, MarketingPage> = {
  home: {
    paths: { en: "/", sv: "/sv", fr: "/fr" },
    translated: true,
    lastModified: "2026-11-17",
    priority: 1,
  },
  accountants: {
    paths: { en: "/accountants", sv: "/sv/redovisningsbyra", fr: "/fr/experts-comptables" },
    translated: true,
    lastModified: "2026-11-17",
    priority: 0.9,
  },
  freelancers: {
    paths: { en: "/freelancers", sv: "/sv/enskild-firma", fr: "/fr/independants" },
    translated: true,
    lastModified: "2026-11-17",
    priority: 0.9,
  },
  smallBusiness: {
    paths: { en: "/small-business", sv: "/sv/smaforetag", fr: "/fr/tpe" },
    translated: true,
    lastModified: "2026-11-17",
    priority: 0.9,
  },
  about: {
    paths: { en: "/about", sv: "/sv/om-unreceipt", fr: "/fr/a-propos" },
    translated: true,
    lastModified: "2026-11-17",
    priority: 0.8,
  },
  // The guides index of each language: its own list of guides.
  guides: {
    paths: { en: "/guides", sv: "/sv/guider", fr: "/fr/guides" },
    translated: true,
    lastModified: "2026-11-17",
    priority: 0.6,
  },
  // The demo request (and contact) form, in each language.
  bookDemo: {
    paths: { en: "/book-demo", sv: "/sv/boka-demo", fr: "/fr/demander-une-demo" },
    translated: true,
    lastModified: "2026-11-18",
    priority: 0.8,
  },
  guideRetention: {
    paths: {
      en: "/guides/how-long-to-keep-receipts",
      sv: "/sv/guider/hur-lange-ska-man-spara-kvitton",
      fr: "/fr/guides/duree-de-conservation-des-justificatifs",
    },
    translated: false,
    lastModified: "2026-11-08",
    priority: 0.7,
  },
  guidePaper: {
    paths: {
      sv: "/sv/guider/fa-man-slanga-papperskvitton",
      fr: "/fr/guides/jeter-les-tickets-de-caisse-apres-numerisation",
    },
    translated: false,
    lastModified: "2026-11-17",
    priority: 0.7,
  },
  guideOutlays: {
    paths: { sv: "/sv/guider/utlagg-for-anstallda" },
    translated: false,
    lastModified: "2026-11-17",
    priority: 0.7,
  },
};

/** The page's path in a language; throws if that version doesn't exist. */
export function pagePath(id: MarketingPageId, locale: Locale): string {
  const path = MARKETING_PAGES[id].paths[locale];
  if (!path) throw new Error(`No ${locale} version of marketing page ${id}`);
  return path;
}

/**
 * Where a "Book a demo" link goes from a page in this language: the demo page
 * in that language when it exists, else the English one. Every demo CTA uses
 * this, never a mailto: link.
 */
export function demoRequestPath(locale: Locale): string {
  const paths = MARKETING_PAGES.bookDemo.paths;
  return paths[locale] ?? paths.en!;
}

/** The language of the page demoRequestPath(locale) leads to (for hrefLang). */
export function demoRequestLang(locale: Locale): Locale {
  return MARKETING_PAGES.bookDemo.paths[locale] ? locale : "en";
}

/** hreflang map for a page: every language it exists in, plus x-default. */
export function pageLanguages(id: MarketingPageId): Record<string, string> | undefined {
  const page = MARKETING_PAGES[id];
  if (!page.translated) return undefined;
  const languages: Record<string, string> = { ...page.paths } as Record<string, string>;
  languages["x-default"] = page.paths.en ?? Object.values(page.paths)[0]!;
  return languages;
}

/** Every marketing path, every language. The proxy keeps these on the apex. */
export const MARKETING_PATHS: readonly string[] = Object.values(MARKETING_PAGES).flatMap(
  (p) => Object.values(p.paths) as string[]
);
