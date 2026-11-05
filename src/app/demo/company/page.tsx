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
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const n = Math.min(Math.max(Number.parseInt(step ?? "1", 10) || 1, 1), 4);
  return <CompanyTour step={n} />;
}
