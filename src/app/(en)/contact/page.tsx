import type { Metadata } from "next";
import { CONTACT_COPY } from "@/app/_contact-copy";
import { ContactPage } from "@/app/_contact-page";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// Contact page, en. Copy in src/app/_contact-copy.ts; PILOT_MODE changes
// the header's call to action and is read at build time (src/lib/pilot.ts).

const t = CONTACT_COPY.en;

export const metadata: Metadata = marketingMetadata({
  page: "contact",
  locale: "en",
  title: t.meta.title,
  description: t.meta.description,
  shareTitle: t.meta.shareTitle,
});

export default function Page() {
  return <ContactPage locale="en" pilotMode={isPilotMode()} />;
}
