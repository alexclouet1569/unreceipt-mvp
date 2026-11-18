import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import {
  SV_DESCRIPTION,
  SV_SHARE_DESCRIPTION,
  SV_TITLE,
  jsonLdHtml,
  landingJsonLd,
  marketingMetadata,
} from "@/lib/seo";
import { LandingPage } from "@/app/_landing-page";

// Swedish landing page. Same layout as `/`, Swedish copy, prices in SEK.

export const metadata: Metadata = marketingMetadata({
  page: "home",
  locale: "sv",
  title: SV_TITLE,
  description: SV_DESCRIPTION,
  shareTitle: "UnReceipt — Från kaos till klarhet",
  shareDescription: SV_SHARE_DESCRIPTION,
  keywords: [
    "kvittohantering",
    "kvittohantering småföretag",
    "kvittoapp",
    "kvitton företag",
    "kvitton enskild firma",
    "kvittohantering redovisningsbyrå",
    "spara kvitton digitalt",
    "moms kvitto",
    "bokföringsunderlag",
  ],
});

export default function Page() {
  const pilotMode = isPilotMode();
  return (
    <>
      <script
        type="application/ld+json"
        // Same structured data as `/`, in Swedish with SEK offers.
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(landingJsonLd(pilotMode, "sv")) }}
      />
      <LandingPage pilotMode={pilotMode} locale="sv" />
    </>
  );
}
