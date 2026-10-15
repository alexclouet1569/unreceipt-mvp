import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import {
  FR_DESCRIPTION,
  FR_SHARE_DESCRIPTION,
  FR_TITLE,
  LANDING_LANGUAGES,
  SITE_URL,
  landingJsonLd,
} from "@/lib/seo";
import { HtmlLang } from "../_html-lang";
import { LandingPage } from "../_landing";

// French landing page. Same layout as `/`, French copy, prices in EUR.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: FR_TITLE },
  description: FR_DESCRIPTION,
  keywords: [
    "gestion des reçus",
    "gestion des justificatifs",
    "numérisation tickets de caisse",
    "reçus TVA petite entreprise",
    "conservation des justificatifs",
    "application reçus entreprise",
  ],
  alternates: { canonical: "/fr", languages: LANDING_LANGUAGES },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: `${SITE_URL}/fr`,
    siteName: "UnReceipt",
    title: "UnReceipt — Du chaos à la clarté",
    description: FR_SHARE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "UnReceipt — Du chaos à la clarté",
    description: FR_SHARE_DESCRIPTION,
  },
};

export default function Page() {
  const pilotMode = isPilotMode();
  return (
    <>
      <script
        type="application/ld+json"
        // Same structured data as `/`, in French.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd(pilotMode, "fr")) }}
      />
      <HtmlLang lang="fr" />
      <LandingPage pilotMode={pilotMode} locale="fr" />
    </>
  );
}
