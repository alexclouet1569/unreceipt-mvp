import type { Metadata } from "next";
import { AccountantTour } from "./_accountant-tour";
import { ACCOUNTANT_STEP_COUNT } from "./steps";
import { joinQrDataUrl } from "@/lib/firm/join-qr";
import { CLIENT_GUIDE_PATH, recommendEmail } from "@/lib/firm/recommend";

const DEMO_JOIN_URL = "https://app.unreceipt.com/app/connect/Bergstrom-demo-link-01";
import type { DemoParams } from "./_firm-app";

// Public guided tour of the accounting-firm portal: the real /firm screens
// with sample data. Every /api call is answered in the browser.

export const metadata: Metadata = {
  title: "Demo for accountants",
  robots: { index: false, follow: false },
};

export default async function AccountantTourPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  // Five steps (the last is the tour's end screen): a cap at 4 sent "Next"
  // on step 4 back to step 4.
  const step = Math.min(Math.max(Number.parseInt(sp.step ?? "1", 10) || 1, 1), ACCOUNTANT_STEP_COUNT);
  const view: DemoParams["view"] | null =
    sp.view === "clients" || sp.view === "client" || sp.view === "settings" ? sp.view : null;
  // A sample link (it answers "doesn't work" in the real app) and its QR code.
  const joinLink = {
    url: DEMO_JOIN_URL,
    qr: await joinQrDataUrl(DEMO_JOIN_URL),
    off: false,
    isAdmin: false,
    recommend: recommendEmail({
      firmName: "Bergström Redovisning AB",
      joinUrl: DEMO_JOIN_URL,
      guideUrl: `https://app.unreceipt.com${CLIENT_GUIDE_PATH}`,
    }),
  };
  return <AccountantTour step={step} view={view} org={sp.org ?? null} month={sp.month ?? null} joinLink={joinLink} />;
}
