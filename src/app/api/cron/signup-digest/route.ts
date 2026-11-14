// Daily (vercel.json): emails the founder who signed up in the last 24
// hours — see src/lib/signup-digest.ts.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { digestFailed, runSignupDigest } from "@/lib/signup-digest";

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
    if (digestFailed(result)) {
      // sendEmail() already reported a failed send; a missing recipient
      // is only visible here.
      Sentry.captureMessage(`Signup digest not sent (${result.reason})`, {
        level: "error",
        tags: { area: "signup-digest", reason: result.reason },
      });
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/signup-digest] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "signup-digest" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
