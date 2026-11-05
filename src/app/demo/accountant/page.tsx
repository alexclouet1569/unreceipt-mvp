import type { Metadata } from "next";
import { AccountantTour } from "./_accountant-tour";
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
  const step = Math.min(Math.max(Number.parseInt(sp.step ?? "1", 10) || 1, 1), 4);
  const view: DemoParams["view"] | null =
    sp.view === "clients" || sp.view === "client" || sp.view === "settings" ? sp.view : null;
  return <AccountantTour step={step} view={view} org={sp.org ?? null} month={sp.month ?? null} />;
}
