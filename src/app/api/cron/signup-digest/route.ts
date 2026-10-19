// Daily (vercel.json): emails the founder who signed up in the last 24
// hours and what happened in the app — see src/lib/signup-digest.ts.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runSignupDigest } from "@/lib/signup-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSignupDigest();
    console.log("[cron/signup-digest]", result);
    // The email is the founder's only sign the job runs; a night without it
    // must show up somewhere.
    if (!result.sent) {
      console.error("[cron/signup-digest] not sent", result.reason);
      Sentry.captureMessage(`signup digest not sent: ${result.reason}`, {
        level: "error",
        tags: { area: "signup-digest" },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/signup-digest] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "signup-digest" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
