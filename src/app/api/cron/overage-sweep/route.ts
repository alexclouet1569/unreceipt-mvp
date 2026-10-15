// Daily (vercel.json): re-reports extra receipts whose Stripe meter call
// failed — see sweepUnbilledOverage() in src/lib/usage.ts.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sweepUnbilledOverage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await sweepUnbilledOverage();
    console.log("[cron/overage-sweep]", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/overage-sweep] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "usage-sweep" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
