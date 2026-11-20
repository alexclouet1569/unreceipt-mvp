// Daily (vercel.json): the booking agent's upkeep, see
// src/lib/accounting/maintenance.ts. 500 when the job couldn't run.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { runAccountingMaintenance } from "@/lib/accounting/maintenance";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const startedAt = Date.now();
    const result = await runAccountingMaintenance({ deadline: startedAt + (maxDuration - 40) * 1000 });
    console.log("[cron/accounting]", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/accounting] failed", err instanceof Error ? err.name : "unknown");
    Sentry.captureException(err, { tags: { area: "accounting", step: "cron" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
