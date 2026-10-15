// Daily (vercel.json): deletes accountant exports older than
// EXPORT_TTL_HOURS. Their signed links expired long before; the ZIPs are
// copies of data we keep anyway, so there's no reason to hold them.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { cleanupExports } from "@/lib/export/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await cleanupExports();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/cleanup-exports] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "export-cleanup" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
