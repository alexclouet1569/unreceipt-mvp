import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import {
  FR_DESCRIPTION,
  FR_SHARE_DESCRIPTION,
  FR_TITLE,
  jsonLdHtml,
  landingJsonLd,
  marketingMetadata,
} from "@/lib/seo";
import { HtmlLang } from "../_html-lang";
import { LandingPage } from "../_landing";

// French landing page. Same layout as `/`, French copy, prices in EUR.
export const dynamic = "force-dynamic";

export const metadata: Metadata = marketingMetadata({
  page: "home",
  locale: "fr",
  title: FR_TITLE,
  description: FR_DESCRIPTION,
  shareTitle: "UnReceipt — Du chaos à la clarté",
  shareDescription: FR_SHARE_DESCRIPTION,
  keywords: [
    "gestion des reçus",
    "gestion des justificatifs",
    "application reçus entreprise",
    "photo tickets de caisse",
    "justificatifs expert-comptable",
    "reçus TVA petite entreprise",
    "justificatifs auto-entrepreneur",
  ],
});

export default function Page() {
  const pilotMode = isPilotMode();
  return (
    <>
      <script
        type="application/ld+json"
        // Same structured data as `/`, in French.
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(landingJsonLd(pilotMode, "fr")) }}
      />
      <HtmlLang lang="fr" />
      <LandingPage pilotMode={pilotMode} locale="fr" />
    </>
  );
}
