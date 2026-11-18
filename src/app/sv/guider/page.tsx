import type { Metadata } from "next";
import { GuidesIndexPage } from "@/app/_guides-index-page";
import { GUIDES_INDEX } from "@/lib/guides";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// Guides index, sv. Copy in src/lib/guides.ts (GUIDES_INDEX).

const t = GUIDES_INDEX.sv;

export const metadata: Metadata = marketingMetadata({
  page: "guides",
  locale: "sv",
  title: t.metaTitle,
  description: t.description,
  shareTitle: t.title,
});

export default function Page() {
  return <GuidesIndexPage locale="sv" pilotMode={isPilotMode()} />;
}
