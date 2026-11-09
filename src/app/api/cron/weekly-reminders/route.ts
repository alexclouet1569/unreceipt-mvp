// Daily (vercel.json), sends Monday to Wednesday: the weekly email to each
// firm's clients about missing receipts — see src/lib/reminders/weekly.ts.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runWeeklyReminders } from "@/lib/reminders/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWeeklyReminders();
    console.log("[cron/weekly-reminders]", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/weekly-reminders] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "weekly-reminders" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
