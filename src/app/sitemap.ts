import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Public marketing pages only; the product (app.unreceipt.com) stays out.
//
// lastModified is a fixed date, not `new Date()`: a date that changes on
// every request tells Google nothing, so it learns to ignore it. Bump the
// date when the page's visible content actually changes.
export default function sitemap(): MetadataRoute.Sitemap {
  // Each language version lists the others, matching the hreflang tags.
  const languages = { en: SITE_URL, sv: `${SITE_URL}/sv`, fr: `${SITE_URL}/fr` };
  return [
    {
      url: SITE_URL,
      lastModified: "2026-10-15",
      changeFrequency: "weekly",
      priority: 1,
      alternates: { languages },
    },
    {
      url: `${SITE_URL}/sv`,
      lastModified: "2026-10-15",
      changeFrequency: "weekly",
      priority: 1,
      alternates: { languages },
    },
    {
      url: `${SITE_URL}/fr`,
      lastModified: "2026-10-15",
      changeFrequency: "weekly",
      priority: 1,
      alternates: { languages },
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: "2026-10-14",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
