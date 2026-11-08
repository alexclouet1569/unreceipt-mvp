import type { Metadata } from "next";
import { AboutPage } from "@/app/_about-page";
import { getAbout } from "@/lib/about";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// "About UnReceipt" fact sheet, sv. Facts in src/lib/about.ts.
export const dynamic = "force-dynamic";

// Titles and descriptions don't depend on PILOT_MODE; the pricing fact does.
const meta = getAbout("sv", false).meta;

export const metadata: Metadata = marketingMetadata({
  page: "about",
  locale: "sv",
  title: meta.title,
  description: meta.description,
});

export default function Page() {
  return <AboutPage locale="sv" pilotMode={isPilotMode()} />;
}
