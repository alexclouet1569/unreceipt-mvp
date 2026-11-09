import type { MetadataRoute } from "next";
import { MARKETING_PAGES, pageLanguages } from "@/lib/marketing-pages";
import { absoluteUrl } from "@/lib/seo";

// Public marketing pages only; the product (app.unreceipt.com) stays out.
// Built from MARKETING_PAGES, so a new page is listed the moment it's
// registered there.
//
// lastModified is a fixed date per page, not `new Date()`: a date that
// changes on every request tells Google nothing, so it learns to ignore
// it. Bump the page's date in marketing-pages.ts when its visible content
// actually changes.
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const id of Object.keys(MARKETING_PAGES) as (keyof typeof MARKETING_PAGES)[]) {
    const page = MARKETING_PAGES[id];
    const languages = pageLanguages(id);
    // Each language version lists the others, matching the hreflang tags.
    const alternates = languages
      ? {
          languages: Object.fromEntries(
            Object.entries(languages)
              .filter(([lang]) => lang !== "x-default")
              .map(([lang, path]) => [lang, absoluteUrl(path)])
          ),
        }
      : undefined;
    for (const path of Object.values(page.paths)) {
      entries.push({
        url: absoluteUrl(path),
        lastModified: page.lastModified,
        changeFrequency: id === "home" ? "weekly" : "monthly",
        priority: page.priority,
        ...(alternates ? { alternates } : {}),
      });
    }
  }
  entries.push({
    url: absoluteUrl("/privacy"),
    lastModified: "2026-10-15",
    changeFrequency: "yearly",
    priority: 0.3,
  });
  return entries;
}
