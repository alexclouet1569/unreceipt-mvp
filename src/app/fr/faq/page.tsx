import type { Metadata } from "next";
import { FaqPage } from "@/app/_faq-page";
import { FAQ_PAGE } from "@/lib/faq";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// FAQ, fr. Questions and page copy in src/lib/faq.ts.

const t = FAQ_PAGE.fr;

export const metadata: Metadata = marketingMetadata({
  page: "faq",
  locale: "fr",
  title: t.metaTitle,
  description: t.description,
  shareTitle: t.title,
});

export default function Page() {
  return <FaqPage locale="fr" pilotMode={isPilotMode()} />;
}
