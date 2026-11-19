import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIENCE_COPY, type AudienceId } from "@/app/_audience-copy";
import { fill } from "@/app/_landing-copy";
import sitemap from "@/app/sitemap";
import { GUIDES } from "@/lib/guides";
import { LOCALES } from "@/lib/locale";
import {
  MARKETING_PAGES,
  MARKETING_PATHS,
  pageLanguages,
  type MarketingPageId,
} from "@/lib/marketing-pages";
import { GUIDES_INDEX, guidesFor } from "@/lib/guides";
import { SHARE_CARDS } from "@/app/og/_cards";
import {
  SAME_AS,
  absoluteUrl,
  audienceJsonLd,
  guideJsonLd,
  guidesIndexJsonLd,
  jsonLdHtml,
  marketingMetadata,
  organizationNode,
} from "@/lib/seo";

const ids = Object.keys(MARKETING_PAGES) as MarketingPageId[];

describe("marketing page registry", () => {
  it("has a page file for every registered path", () => {
    for (const path of MARKETING_PATHS) {
      // English pages live in the (en) route group (their own root layout).
      const dir = /^\/(sv|fr)(\/|$)/.test(path) ? "src/app" : "src/app/(en)";
      const file = join(process.cwd(), dir, path === "/" ? "" : path, "page.tsx");
      expect(existsSync(file), `${path} → ${file}`).toBe(true);
    }
  });

  it("never registers the same path twice", () => {
    expect(new Set(MARKETING_PATHS).size).toBe(MARKETING_PATHS.length);
  });

  it("keeps each language under its own prefix and off product paths", () => {
    for (const id of ids) {
      for (const [locale, path] of Object.entries(MARKETING_PAGES[id].paths)) {
        if (locale !== "en") expect(path === `/${locale}` || path.startsWith(`/${locale}/`)).toBe(true);
        expect(path).not.toMatch(/^\/(app|admin|firm|demo|auth|subscribe|api)(\/|$)/);
        // Slugs are plain ASCII so they survive copy-paste and URL encoding.
        expect(path).toMatch(/^[a-z0-9/-]*$/);
      }
    }
  });

  it("gives translated pages hreflang for every language and x-default", () => {
    for (const id of ids) {
      const languages = pageLanguages(id);
      if (!MARKETING_PAGES[id].translated) {
        expect(languages).toBeUndefined();
        continue;
      }
      for (const locale of LOCALES) expect(languages![locale]).toBe(MARKETING_PAGES[id].paths[locale]);
      expect(languages!["x-default"]).toBe(MARKETING_PAGES[id].paths.en);
    }
  });
});

describe("sitemap", () => {
  const entries = sitemap();

  it("lists every marketing page plus privacy", () => {
    const urls = entries.map((e) => e.url);
    for (const path of MARKETING_PATHS) expect(urls).toContain(absoluteUrl(path));
    expect(urls).toContain(absoluteUrl("/privacy"));
    expect(urls.every((u) => u.startsWith("https://unreceipt.com"))).toBe(true);
  });

  it("uses the same alternates as the hreflang tags", () => {
    const home = entries.find((e) => e.url === "https://unreceipt.com/sv/redovisningsbyra")!;
    expect(home.alternates?.languages).toEqual({
      en: "https://unreceipt.com/accountants",
      sv: "https://unreceipt.com/sv/redovisningsbyra",
      fr: "https://unreceipt.com/fr/experts-comptables",
    });
    const guide = entries.find((e) => e.url.includes("/guider/"))!;
    expect(guide.alternates).toBeUndefined();
  });
});

describe("marketingMetadata", () => {
  it("keeps the share image, canonical and title on every page", () => {
    for (const id of ids) {
      for (const locale of Object.keys(MARKETING_PAGES[id].paths) as (keyof typeof MARKETING_PAGES[typeof id]["paths"])[]) {
        const meta = marketingMetadata({ page: id, locale, title: "T", description: "D" });
        expect(meta.alternates?.canonical).toBe(MARKETING_PAGES[id].paths[locale]);
        const images = (meta.openGraph as { images: { url: string }[] }).images;
        expect(images[0].url).toBe(`/og/${id}-${locale}.png`);
        expect(meta.title).toEqual({ absolute: "T" });
      }
    }
  });
});

describe("audience pages", () => {
  const audiences: AudienceId[] = ["accountants", "freelancers", "smallBusiness"];

  it("mirrors the visible FAQ in the FAQPage structured data", () => {
    for (const audience of audiences) {
      for (const locale of LOCALES) {
        const t = AUDIENCE_COPY[audience][locale];
        const graph = audienceJsonLd({
          page: audience,
          locale,
          name: t.meta.title,
          description: t.meta.description,
          breadcrumb: t.breadcrumb,
          audienceType: t.audienceType,
          faq: t.faq,
        })["@graph"];
        const faq = graph.find((n) => n["@type"] === "FAQPage") as {
          mainEntity: { name: string; acceptedAnswer: { text: string } }[];
        };
        expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
          t.faq.map((i) => [i.q, i.a])
        );
        expect(graph.some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
      }
    }
  });

  it("leaves no unfilled placeholder in any string", () => {
    for (const audience of audiences) {
      for (const locale of LOCALES) {
        const text = JSON.stringify(AUDIENCE_COPY[audience][locale]);
        const filled = fill(text, { price: "X" });
        expect(filled, `${audience}/${locale}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("keeps search titles and descriptions to a length Google shows", () => {
    for (const audience of audiences) {
      for (const locale of LOCALES) {
        const { title, description } = AUDIENCE_COPY[audience][locale].meta;
        expect(title.length, title).toBeLessThanOrEqual(80);
        expect(description.length, description).toBeLessThanOrEqual(220);
      }
    }
  });
});

describe("small business page", () => {
  it("states the team feature's limits in every language", () => {
    // AGENTS.md "Company team and approvals": no payout or payroll file, and
    // an employee who deletes their account takes their receipts with them.
    for (const locale of LOCALES) {
      const faq = AUDIENCE_COPY.smallBusiness[locale].faq.map((i) => i.a).join(" ");
      expect(faq, locale).toMatch(/Fortnox|Pennylane/);
      expect(faq, locale).toMatch(/payroll|lönesystem|paie/);
      expect(faq, locale).toMatch(/deletes their own|raderar sitt eget|supprime son propre/);
    }
  });

  it("is linked from every language's about card and footer", async () => {
    const { SITE_COPY } = await import("@/app/_site-copy");
    for (const locale of LOCALES) expect(SITE_COPY[locale].nav.smallBusiness.length).toBeGreaterThan(0);
  });
});

describe("guides", () => {
  it("exists for every registered guide path, once", () => {
    for (const id of ["guideRetention", "guidePaper", "guideOutlays"] as const) {
      for (const locale of Object.keys(MARKETING_PAGES[id].paths)) {
        expect(GUIDES.filter((g) => g.page === id && g.locale === locale)).toHaveLength(1);
      }
    }
  });

  it("cites https sources and a review date on every guide", () => {
    for (const g of GUIDES) {
      expect(g.sources.length).toBeGreaterThan(0);
      expect(g.sources.every((s) => s.url.startsWith("https://"))).toBe(true);
      expect(g.updated >= g.published).toBe(true);
    }
  });

  it("describes each guide as an Article with its dates", () => {
    for (const g of GUIDES) {
      const graph = guideJsonLd({
        page: g.page,
        locale: g.locale,
        headline: g.title,
        description: g.description,
        breadcrumb: g.breadcrumb,
        published: g.published,
        updated: g.updated,
        faq: g.faq,
      })["@graph"];
      const article = graph.find((n) => n["@type"] === "Article") as {
        datePublished: string;
        dateModified: string;
        inLanguage: string;
      };
      expect(article.datePublished).toBe(g.published);
      expect(article.dateModified).toBe(g.updated);
      expect(article.inLanguage).toBe(g.locale);
    }
  });

  it("keeps Swedish and French rules on their own pages", () => {
    // AGENTS.md: one country's rules per language page. The French paper
    // guide must never tell readers they can throw paper away.
    const paperFr = GUIDES.find((g) => g.page === "guidePaper" && g.locale === "fr")!;
    expect(paperFr.answer).toMatch(/^En principe, non/);
    const paperSv = GUIDES.find((g) => g.page === "guidePaper" && g.locale === "sv")!;
    expect(paperSv.answer).toMatch(/^Ja/);
    expect(paperSv.sections.map((s) => s.body.join(" ")).join(" ")).toContain("Skatteverket");
  });
  it("keeps the outlays guide honest about what UnReceipt doesn't do", () => {
    // Founder decision 2026-11-17: the limits stay on the page (AGENTS.md
    // "Company team": no payout or payroll file; an employee's receipts go
    // with their account).
    const outlays = GUIDES.find((g) => g.page === "guideOutlays" && g.locale === "sv")!;
    const text = outlays.sections.flatMap((s) => [...s.body, ...(s.list ?? [])]).join(" ");
    expect(text).toContain("lönefil");
    expect(text).toContain("Raderar en anställd sitt konto");
    // Its second button asks for a demo (every guide's does since the tour
    // closed, 2026-11-18).
    expect(outlays.cta.secondaryLabel).toMatch(/demo/i);
  });
});

describe("guides index", () => {
  it("exists in every language that has a guide, and lists only that language's guides", () => {
    for (const locale of LOCALES) {
      const own = GUIDES.filter((g) => g.locale === locale);
      if (own.length === 0) continue;
      expect(MARKETING_PAGES.guides.paths[locale], locale).toBeDefined();
      expect(guidesFor(locale)).toHaveLength(own.length);
      const graph = guidesIndexJsonLd(locale)["@graph"];
      const page = graph.find((n) => n["@type"] === "CollectionPage") as {
        mainEntity: { itemListElement: { url: string }[] };
      };
      expect(page.mainEntity.itemListElement.map((i) => i.url).sort()).toEqual(
        own.map((g) => absoluteUrl(MARKETING_PAGES[g.page].paths[locale]!)).sort()
      );
    }
    expect(MARKETING_PAGES.guides.paths.sv).toBe("/sv/guider");
  });

  it("puts the index between home and every guide in the breadcrumbs", () => {
    for (const g of GUIDES) {
      const graph = guideJsonLd({
        page: g.page,
        locale: g.locale,
        headline: g.title,
        description: g.description,
        breadcrumb: g.breadcrumb,
        published: g.published,
        updated: g.updated,
        faq: g.faq,
      })["@graph"];
      const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList") as {
        itemListElement: { name: string; item: string }[];
      };
      expect(crumbs.itemListElement.map((i) => i.name)).toEqual([
        "UnReceipt",
        GUIDES_INDEX[g.locale].breadcrumb,
        g.breadcrumb,
      ]);
      expect(crumbs.itemListElement[1].item).toBe(absoluteUrl(MARKETING_PAGES.guides.paths[g.locale]!));
    }
  });
});

describe("share images", () => {
  it("has one card per page and language, matching the image marketingMetadata links", () => {
    const expected = ids.flatMap((id) => Object.keys(MARKETING_PAGES[id].paths).map((l) => `${id}-${l}.png`));
    expect(SHARE_CARDS.map((c) => c.file).sort()).toEqual(expected.sort());
    for (const c of SHARE_CARDS) {
      expect(c.file).toMatch(/^[a-zA-Z]+-(en|sv|fr)\.png$/);
      expect(c.eyebrow.trim(), c.file).not.toBe("");
      expect(c.title.trim(), c.file).not.toBe("");
      expect(`${c.eyebrow} ${c.title}`, c.file).not.toMatch(/undefined|\{\w+\}/);
    }
  });

  it("writes each card in its page's language", () => {
    const card = (file: string) => SHARE_CARDS.find((c) => c.file === file)!;
    expect(card("accountants-sv.png").eyebrow).toBe(AUDIENCE_COPY.accountants.sv.hero.eyebrow);
    expect(card("guides-fr.png").title).toBe(GUIDES_INDEX.fr.title);
  });
});

describe("Organization sameAs", () => {
  it("is left out while there is no profile, and lists only https profile URLs", () => {
    const org = organizationNode() as { sameAs?: string[] };
    if (SAME_AS.length === 0) {
      expect(org.sameAs).toBeUndefined();
    } else {
      expect(org.sameAs).toEqual([...SAME_AS]);
      for (const url of SAME_AS) expect(url).toMatch(/^https:\/\/[^\s]+$/);
    }
  });
});

describe("LinkedIn company page", () => {
  it("names the public LinkedIn page as the same company, and links it from the footer", () => {
    const org = organizationNode() as { sameAs?: string[] };
    expect(org.sameAs).toContain("https://www.linkedin.com/company/unreceipt/");
    // The admin's own view must never be published.
    for (const url of SAME_AS) expect(url).not.toMatch(/viewAsMember|\/home\b/);
    const chrome = readFileSync(join(process.cwd(), "src/app/_site-chrome.tsx"), "utf8");
    expect(chrome).toContain("LINKEDIN_URL");
  });
});

describe("jsonLdHtml", () => {
  it("can't close the script tag, and still parses to the same data", () => {
    const data = { a: "</script><script>alert(1)</script>" };
    const html = jsonLdHtml(data);
    expect(html).not.toContain("<");
    expect(JSON.parse(html)).toEqual(data);
  });
});

describe("AI search visibility", () => {
  it("names the AI crawlers in robots.txt and keeps the product out", async () => {
    const { default: robots, AI_CRAWLERS } = await import("@/app/robots");
    const rules = [robots().rules].flat();
    const ai = rules.find((r) => Array.isArray(r.userAgent))!;
    for (const bot of ["OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended", "bingbot"]) {
      expect(AI_CRAWLERS).toContain(bot);
    }
    expect(ai.allow).toBe("/");
    for (const r of rules) expect(r.disallow).toEqual(expect.arrayContaining(["/app", "/api/", "/admin", "/firm"]));
  });

  it("serves the IndexNow key file that the proxy lets through", async () => {
    const { INDEXNOW_KEY } = await import("@/lib/indexnow");
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`), "utf8")).toBe(INDEXNOW_KEY);
    expect(readFileSync(join(process.cwd(), "src", "lib", "host-proxy.ts"), "utf8")).toContain("`/${INDEXNOW_KEY}.txt`");
  });

  it("puts every fact sheet, FAQ and guide into /llms-full.txt", async () => {
    const { GET } = await import("@/app/llms-full.txt/route");
    const { getAbout } = await import("@/lib/about");
    const text = await GET().text();
    for (const locale of LOCALES) {
      expect(text).toContain(getAbout(locale, false).summary);
      expect(text).toContain(AUDIENCE_COPY.accountants[locale].faq[0].a);
      expect(text).toContain(AUDIENCE_COPY.smallBusiness[locale].faq[0].a);
      expect(text).toContain(absoluteUrl(MARKETING_PAGES.faq.paths[locale]!));
    }
    for (const g of GUIDES) expect(text).toContain(g.answer);
    expect(text).not.toMatch(/undefined|\{\w+\}/);
  });

  it("states the limits on every fact sheet", async () => {
    const { getAbout } = await import("@/lib/about");
    for (const locale of LOCALES) expect(getAbout(locale, true).limits.length).toBeGreaterThan(2);
  });

  it("shows no plan price anywhere public while SHOW_PRICES is off", async () => {
    const { SHOW_PRICES } = await import("@/lib/pricing-visibility");
    if (SHOW_PRICES) return;
    const { getAbout } = await import("@/lib/about");
    const { getFaq } = await import("@/lib/faq");
    const { faqPageJsonLd, landingJsonLd } = await import("@/lib/seo");
    const { GET: llms } = await import("@/app/llms.txt/route");
    const { GET: llmsFull } = await import("@/app/llms-full.txt/route");
    const { PLANS, OVERAGE_PRICE, formatPrice, formatEurFr, formatSek, OVERAGE_PRICE_SEK } = await import("@/lib/plans");
    const amounts = [
      ...PLANS.flatMap((p) => [formatPrice(p.price), formatEurFr(p.price), formatSek(p.priceSek), p.price.toFixed(2)]),
      formatPrice(OVERAGE_PRICE),
      formatEurFr(OVERAGE_PRICE),
      formatSek(OVERAGE_PRICE_SEK),
    ];
    const { SHARE_CARDS } = await import("@/app/og/_cards");
    const texts = [await llms().text(), await llmsFull().text(), JSON.stringify(SHARE_CARDS)];
    for (const locale of LOCALES) {
      for (const pilot of [true, false]) {
        texts.push(JSON.stringify(getAbout(locale, pilot)));
        texts.push(JSON.stringify(getFaq(pilot, locale)));
        texts.push(JSON.stringify(landingJsonLd(pilot, locale)));
        texts.push(JSON.stringify(faqPageJsonLd(pilot, locale)));
        texts.push(JSON.stringify(AUDIENCE_COPY.freelancers[locale]).replace(/"note(Pilot|Paid)":"[^"]*"/g, ""));
        texts.push(JSON.stringify(guidesIndexJsonLd(locale)));
        texts.push(JSON.stringify(AUDIENCE_COPY.smallBusiness[locale]));
      }
    }
    // Whole amounts only: "29,99 €" inside a sample receipt's "129,99 €" is not a plan price.
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const text of texts) {
      for (const amount of amounts) expect(text, amount).not.toMatch(new RegExp(`(^|[^0-9,.])${esc(amount)}`));
    }
  });
});
