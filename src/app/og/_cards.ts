import { AUDIENCE_COPY } from "@/app/_audience-copy";
import { DEMO_REQUEST_COPY } from "@/app/_demo-request-copy";
import { LANDING_COPY } from "@/app/_landing-copy";
import { getAbout } from "@/lib/about";
import { GUIDES_INDEX, getGuide } from "@/lib/guides";
import type { Locale } from "@/lib/locale";
import { MARKETING_PAGES, type MarketingPageId } from "@/lib/marketing-pages";
import { shareImagePath } from "@/lib/seo";

/**
 * The text on each marketing page's share image (`/og/<page>-<locale>.png`,
 * set by `marketingMetadata()`): the page's own eyebrow and headline, taken
 * from the same copy the page renders. No prices, whatever SHOW_PRICES says:
 * a shared image outlives a pricing change.
 */

export type ShareCard = {
  page: MarketingPageId;
  locale: Locale;
  /** The file name under /og/. */
  file: string;
  eyebrow: string;
  title: string;
};

function text(page: MarketingPageId, locale: Locale): { eyebrow: string; title: string } {
  switch (page) {
    case "home": {
      const h = LANDING_COPY[locale].hero;
      return { eyebrow: h.seoTitle, title: `${h.titleLine1} ${h.titleLine2} ${h.titleAccent}` };
    }
    case "accountants":
    case "freelancers":
    case "smallBusiness": {
      const h = AUDIENCE_COPY[page][locale].hero;
      return { eyebrow: h.eyebrow, title: `${h.title} ${h.accent}` };
    }
    case "about": {
      const a = getAbout(locale, false);
      return { eyebrow: a.eyebrow, title: a.title };
    }
    case "guides":
      return { eyebrow: GUIDES_INDEX[locale].eyebrow, title: GUIDES_INDEX[locale].title };
    case "bookDemo": {
      const h = DEMO_REQUEST_COPY[locale].hero;
      return { eyebrow: h.eyebrow, title: `${h.title} ${h.accent}` };
    }
    case "guideRetention":
    case "guidePaper":
    case "guideOutlays": {
      const g = getGuide(page, locale);
      return { eyebrow: g.eyebrow, title: g.title };
    }
  }
}

/** One card per marketing page and language it exists in. */
export const SHARE_CARDS: readonly ShareCard[] = (Object.keys(MARKETING_PAGES) as MarketingPageId[]).flatMap(
  (page) =>
    (Object.keys(MARKETING_PAGES[page].paths) as Locale[]).map((locale) => ({
      page,
      locale,
      file: shareImagePath(page, locale).slice("/og/".length),
      ...text(page, locale),
    }))
);
