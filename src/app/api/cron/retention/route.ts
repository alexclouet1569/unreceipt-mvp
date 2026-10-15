// Daily (vercel.json): reminder emails and deletion 90 days after a
// cancellation — see src/lib/retention.ts for the rules.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runRetention } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRetention();
    console.log("[cron/retention]", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/retention] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "retention" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
