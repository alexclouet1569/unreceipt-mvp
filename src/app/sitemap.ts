import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Public marketing pages only; the product (app.unreceipt.com) stays out.
//
// lastModified is a fixed date, not `new Date()`: a date that changes on
// every request tells Google nothing, so it learns to ignore it. Bump the
// date when the page's visible content actually changes.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: "2026-10-15",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: "2026-10-14",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
