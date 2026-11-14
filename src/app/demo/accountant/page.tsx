import type { Metadata } from "next";
import { AccountantTour } from "./_accountant-tour";
import { ACCOUNTANT_STEP_COUNT } from "./steps";
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
  return <AccountantTour step={step} view={view} org={sp.org ?? null} month={sp.month ?? null} />;
}
