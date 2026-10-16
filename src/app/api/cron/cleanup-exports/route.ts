// Daily (vercel.json): deletes accountant exports older than
// EXPORT_TTL_HOURS. Their signed links expired long before; the ZIPs are
// copies of data we keep anyway, so there's no reason to hold them.
// Also deletes Gmail forwarding confirmation codes older than 7 days
// (src/lib/forwarding-confirmation-cleanup.ts).

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { cleanupExports } from "@/lib/export/cleanup";
import { cleanupForwardingConfirmations } from "@/lib/forwarding-confirmation-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Independent of the export cleanup: a failure here is reported, not fatal.
  let forwardingConfirmationsDeleted: number | null = null;
  try {
    forwardingConfirmationsDeleted = (await cleanupForwardingConfirmations()).deleted;
  } catch (err) {
    console.error("[cron/cleanup-exports] confirmation cleanup failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "forwarding-confirmation-cleanup" } });
  }
  try {
    const result = await cleanupExports();
    return NextResponse.json({ ...result, forwardingConfirmationsDeleted });
  } catch (err) {
    console.error("[cron/cleanup-exports] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "export-cleanup" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
