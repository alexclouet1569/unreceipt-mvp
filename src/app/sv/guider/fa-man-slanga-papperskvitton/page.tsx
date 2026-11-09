import type { Metadata } from "next";
import { GuidePage } from "@/app/_guide-page";
import { getGuide } from "@/lib/guides";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// Guide, sv. Content and sources in src/lib/guides.ts.
export const dynamic = "force-dynamic";

const g = getGuide("guidePaper", "sv");

export const metadata: Metadata = marketingMetadata({
  page: "guidePaper",
  locale: "sv",
  title: g.metaTitle,
  description: g.description,
  shareTitle: g.title,
  type: "article",
  publishedTime: g.published,
  modifiedTime: g.updated,
});

export default function Page() {
  return <GuidePage page="guidePaper" locale="sv" pilotMode={isPilotMode()} />;
}
