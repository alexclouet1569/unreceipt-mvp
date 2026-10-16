import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DemoClient } from "./_demo-client";

// A sign-in-free look at the product on Vercel preview deployments (and
// `next dev`): the real inbox, capture sheet and digital receipt, filled
// with sample receipts. Nothing is sent to the database or to Claude —
// the client stubs /api/ocr and /api/capture in the browser. Production
// answers 404, so this never exists on app.unreceipt.com.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview demo",
  robots: { index: false, follow: false },
};

function demoAllowed(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "preview";
  return process.env.NODE_ENV === "development";
}

export default function DemoPage() {
  if (!demoAllowed()) notFound();
  return <DemoClient />;
}
