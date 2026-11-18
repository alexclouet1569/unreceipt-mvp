import type { Metadata } from "next";
import { FaqPage } from "@/app/_faq-page";
import { FAQ_PAGE } from "@/lib/faq";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// FAQ, en. Questions and page copy in src/lib/faq.ts.

const t = FAQ_PAGE.en;

export const metadata: Metadata = marketingMetadata({
  page: "faq",
  locale: "en",
  title: t.metaTitle,
  description: t.description,
  shareTitle: t.title,
});

export default function Page() {
  return <FaqPage locale="en" pilotMode={isPilotMode()} />;
}
