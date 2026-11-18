import type { Metadata } from "next";
import { GuidePage } from "@/app/_guide-page";
import { getGuide } from "@/lib/guides";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// Guide, sv. Content and sources in src/lib/guides.ts.

const g = getGuide("guideOutlays", "sv");

export const metadata: Metadata = marketingMetadata({
  page: "guideOutlays",
  locale: "sv",
  title: g.metaTitle,
  description: g.description,
  shareTitle: g.title,
  type: "article",
  publishedTime: g.published,
  modifiedTime: g.updated,
});

export default function Page() {
  return <GuidePage page="guideOutlays" locale="sv" pilotMode={isPilotMode()} />;
}
