import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import {
  LANDING_LANGUAGES,
  SITE_URL,
  SV_DESCRIPTION,
  SV_SHARE_DESCRIPTION,
  SV_TITLE,
  landingJsonLd,
} from "@/lib/seo";
import { HtmlLang } from "../_html-lang";
import { LandingPage } from "../_landing";

// Swedish landing page. Same layout as `/`, Swedish copy, prices in SEK.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: SV_TITLE },
  description: SV_DESCRIPTION,
  keywords: [
    "kvitton företag",
    "kvittohantering",
    "kvittohantering småföretag",
    "spara kvitton digitalt",
    "moms kvitto",
    "kvitto app företag",
    "bokföringsunderlag",
  ],
  alternates: { canonical: "/sv", languages: LANDING_LANGUAGES },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: `${SITE_URL}/sv`,
    siteName: "UnReceipt",
    title: "UnReceipt — Från kaos till klarhet",
    description: SV_SHARE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "UnReceipt — Från kaos till klarhet",
    description: SV_SHARE_DESCRIPTION,
  },
};

export default function Page() {
  const pilotMode = isPilotMode();
  return (
    <>
      <script
        type="application/ld+json"
        // Same structured data as `/`, in Swedish with SEK offers.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd(pilotMode, "sv")) }}
      />
      <HtmlLang lang="sv" />
      <LandingPage pilotMode={pilotMode} locale="sv" />
    </>
  );
}
