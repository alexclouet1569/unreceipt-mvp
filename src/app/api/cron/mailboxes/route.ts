// Daily (vercel.json): upkeep of connected mailboxes (renew push, catch up
// missed mail) for every provider — see src/lib/mailboxes/maintenance.ts.
// Answers 500 when the job couldn't do its work (the connections couldn't
// be read, or every attempt failed), 200 with counts otherwise.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runMailboxMaintenance, systemicFailure } from "@/lib/mailboxes/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const startedAt = Date.now();
    const result = await runMailboxMaintenance({
      startedAt,
      // No new connection after 210 s; every sync stops by 280 s.
      startBudgetMs: (maxDuration - 90) * 1000,
      syncDeadline: startedAt + (maxDuration - 20) * 1000,
    });
    console.log("[cron/mailboxes]", result);
    if (systemicFailure(result)) {
      Sentry.captureMessage("mailbox cron: every attempt failed", { tags: { area: "mailboxes", step: "cron" } });
      return NextResponse.json({ error: "failed", ...result }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/mailboxes] failed", err instanceof Error ? err.name : "unknown");
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "cron" } });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
