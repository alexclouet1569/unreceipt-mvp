import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import { LANDING_LANGUAGES, landingJsonLd } from "@/lib/seo";
import { LandingPage } from "./_landing";

// PILOT_MODE is read server-side here and passed down so the client
// component renders the right CTA copy. Forces dynamic so the toggle
// flips with one redeploy without invalidating a static cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/", languages: LANDING_LANGUAGES },
};

export default function Page() {
  const pilotMode = isPilotMode();
  return (
    <>
      <script
        type="application/ld+json"
        // Structured data for search engines and AI assistants; built from
        // the same plans and FAQ the page renders.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd(pilotMode)) }}
      />
      <LandingPage pilotMode={pilotMode} />
    </>
  );
}
