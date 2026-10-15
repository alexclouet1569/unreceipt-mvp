import type { MetadataRoute } from "next";

// Public pages on the marketing host only; product routes on
// app.unreceipt.com are behind login and stay out of the sitemap.
//
// lastModified is a fixed date, not `new Date()`: a date that changes on
// every request tells Google nothing, so it learns to ignore it. Bump the
// date when the page's content actually changes.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://unreceipt.com",
      lastModified: "2026-10-14",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://unreceipt.com/privacy",
      lastModified: "2026-10-14",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
