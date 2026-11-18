import type { Metadata } from "next";
import { AUDIENCE_COPY } from "@/app/_audience-copy";
import { AudiencePage } from "@/app/_audience-page";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// smallBusiness page (companies with employees), sv. Copy in
// src/app/_audience-copy.ts; PILOT_MODE changes the call to action; it is
// read at build time (src/lib/pilot.ts).

const t = AUDIENCE_COPY.smallBusiness.sv;

export const metadata: Metadata = marketingMetadata({
  page: "smallBusiness",
  locale: "sv",
  title: t.meta.title,
  description: t.meta.description,
  shareTitle: t.meta.shareTitle,
  keywords: t.meta.keywords,
});

export default function Page() {
  return <AudiencePage audience="smallBusiness" locale="sv" pilotMode={isPilotMode()} />;
}
