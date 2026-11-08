import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Everyone may read the marketing pages; signed-in product surfaces and
// APIs stay out of every index.
//
// AI crawlers are named one by one on purpose. `*` already allows them,
// but some hosting and CDN defaults treat unnamed AI bots as unwelcome,
// and naming them states the intent: we want ChatGPT, Claude, Perplexity,
// Gemini, Copilot and Apple's assistants to read and cite these pages.
// Both kinds are listed: the crawlers that build search indexes and the
// fetchers that read a page when a user asks an assistant about it.

const PRIVATE = ["/api/", "/admin", "/app", "/auth/", "/subscribe", "/firm"];

export const AI_CRAWLERS = [
  // OpenAI: search index, user-triggered fetches, training.
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  // Anthropic.
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  // Perplexity.
  "PerplexityBot",
  "Perplexity-User",
  // Google (Gemini / AI Overviews use Googlebot; Google-Extended is the AI opt-in).
  "Google-Extended",
  // Microsoft Copilot and ChatGPT search lean on Bing's index.
  "bingbot",
  // Apple Intelligence / Siri.
  "Applebot",
  "Applebot-Extended",
  // Others that feed assistants.
  "DuckAssistBot",
  "MistralAI-User",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
