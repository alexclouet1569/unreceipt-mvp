import type { Metadata } from "next";
import { DEMO_REQUEST_COPY } from "@/app/_demo-request-copy";
import { DemoRequestPage } from "@/app/_demo-request-page";
import { isPilotMode } from "@/lib/pilot";
import { marketingMetadata } from "@/lib/seo";

// Demo request page, en. Copy in src/app/_demo-request-copy.ts; PILOT_MODE
// changes the header's call to action and the booking link comes from the
// env, so the page renders per request like the other marketing pages.
export const dynamic = "force-dynamic";

const t = DEMO_REQUEST_COPY.en;

export const metadata: Metadata = marketingMetadata({
  page: "bookDemo",
  locale: "en",
  title: t.meta.title,
  description: t.meta.description,
  shareTitle: t.meta.shareTitle,
});

export default function Page() {
  return <DemoRequestPage locale="en" pilotMode={isPilotMode()} />;
}
