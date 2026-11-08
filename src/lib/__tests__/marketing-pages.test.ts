import { existsSync } from "node:fs";
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
import { absoluteUrl, audienceJsonLd, guideJsonLd, jsonLdHtml, marketingMetadata } from "@/lib/seo";

const ids = Object.keys(MARKETING_PAGES) as MarketingPageId[];

describe("marketing page registry", () => {
  it("has a page file for every registered path", () => {
    for (const path of MARKETING_PATHS) {
      const file = join(process.cwd(), "src/app", path === "/" ? "" : path, "page.tsx");
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
        expect(images[0].url).toBe("/opengraph-image");
        expect(meta.title).toEqual({ absolute: "T" });
      }
    }
  });
});

describe("audience pages", () => {
  const audiences: AudienceId[] = ["accountants", "freelancers"];

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

describe("guides", () => {
  it("exists for every registered guide path, once", () => {
    for (const id of ["guideRetention", "guidePaper"] as const) {
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
});

describe("jsonLdHtml", () => {
  it("can't close the script tag, and still parses to the same data", () => {
    const data = { a: "</script><script>alert(1)</script>" };
    const html = jsonLdHtml(data);
    expect(html).not.toContain("<");
    expect(JSON.parse(html)).toEqual(data);
  });
});
