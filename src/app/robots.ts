import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Everyone — search engines and AI crawlers alike — may read the marketing
// pages. Signed-in product surfaces and APIs are kept out of indexes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/app", "/auth/", "/subscribe"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
