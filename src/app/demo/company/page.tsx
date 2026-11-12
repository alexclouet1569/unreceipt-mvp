import type { Metadata } from "next";
import { CompanyTour } from "./_company-tour";

// Public guided tour for a client company. See _company-tour.tsx.

export const metadata: Metadata = {
  title: "Demo for companies",
  robots: { index: false, follow: false },
};

export default async function CompanyTourPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; period?: string; anchor?: string; from?: string; to?: string }>;
}) {
  const { step, period, anchor, from, to } = await searchParams;
  const n = Math.min(Math.max(Number.parseInt(step ?? "1", 10) || 1, 1), 5);
  // The Insights step's period, checked by the engine itself (an unknown
  // one falls back to this month there).
  return <CompanyTour step={n} period={{ kind: period ?? "month", anchor: anchor ?? null, from: from ?? null, to: to ?? null }} />;
}
