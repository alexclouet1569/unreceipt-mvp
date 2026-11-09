import type { Metadata } from "next";
import { AUDIENCE_COPY } from "@/app/_audience-copy";
import { AudiencePage } from "@/app/_audience-page";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// freelancers page, fr. Copy in src/app/_audience-copy.ts; PILOT_MODE changes
// the call to action, so the page renders per request like the landing.
export const dynamic = "force-dynamic";

const t = AUDIENCE_COPY.freelancers.fr;

export const metadata: Metadata = marketingMetadata({
  page: "freelancers",
  locale: "fr",
  title: t.meta.title,
  description: t.meta.description,
  shareTitle: t.meta.shareTitle,
  keywords: t.meta.keywords,
});

export default function Page() {
  return <AudiencePage audience="freelancers" locale="fr" pilotMode={isPilotMode()} />;
}
