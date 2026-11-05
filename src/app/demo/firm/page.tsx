import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FirmDemo, type DemoParams } from "./_firm-demo";

// A sign-in-free look at the accounting-firm portal on Vercel preview
// deployments (and `next dev`): the real firm screens and the client's
// side of the invite, filled with sample data. Nothing reaches the
// database, Resend or Claude — the client stubs every /api call in the
// browser. Production answers 404, so this never exists on
// app.unreceipt.com. Same rules as /demo.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Firm portal demo",
  robots: { index: false, follow: false },
};

function demoAllowed(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "preview";
  return process.env.NODE_ENV === "development";
}

export default async function FirmDemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!demoAllowed()) notFound();
  const sp = await searchParams;
  const params: DemoParams = {
    as: sp.as === "client" ? "client" : "firm",
    view: sp.view === "client" || sp.view === "settings" ? sp.view : "clients",
    org: sp.org ?? null,
    month: sp.month ?? null,
  };
  return <FirmDemo params={params} />;
}
