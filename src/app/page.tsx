import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import { DESCRIPTION, SHARE_DESCRIPTION, TITLE, jsonLdHtml, landingJsonLd, marketingMetadata } from "@/lib/seo";
import { LandingPage } from "./_landing";

// PILOT_MODE is read server-side here and passed down so the client
// component renders the right CTA copy. Forces dynamic so the toggle
// flips with one redeploy without invalidating a static cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = marketingMetadata({
  page: "home",
  locale: "en",
  title: TITLE,
  description: DESCRIPTION,
  shareTitle: "UnReceipt — From Chaos to Clarity",
  shareDescription: SHARE_DESCRIPTION,
  keywords: [
    "receipt management app",
    "receipt app for small business",
    "receipt software for accountants",
    "VAT receipts",
    "expense receipts small business",
    "receipt scanner app",
    "receipt app Sweden",
  ],
});

export default function Page() {
  const pilotMode = isPilotMode();
  return (
    <>
      <script
        type="application/ld+json"
        // Structured data for search engines and AI assistants; built from
        // the same plans and FAQ the page renders.
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(landingJsonLd(pilotMode)) }}
      />
      <LandingPage pilotMode={pilotMode} />
    </>
  );
}
