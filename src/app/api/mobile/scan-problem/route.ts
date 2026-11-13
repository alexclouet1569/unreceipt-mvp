// POST /api/mobile/scan-problem — the iPhone app tells us that a scan
// didn't go through: why (offline, unsent, timeout, server, busy, missing,
// refused), the upload's HTTP status and how many tries it has had. Counts
// only: never the picture, its text or any name. A failed upload otherwise
// leaves no trace on the server (the request may never reach the scan
// route), so this is how we see it in Sentry.
//
// The app also reads the answer as "the server can be reached": when this
// small call fails too, it shows "Waiting for a connection"; when it
// answers, the app says the upload itself failed instead.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Never "offline": a phone that can't reach us can't report it either.
const PROBLEMS = new Set(["unsent", "timeout", "server", "busy", "missing", "refused"]);
const APP_MAX_ATTEMPTS = 8;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const limited = await rateLimit("clientReport", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const problem = typeof body?.problem === "string" && PROBLEMS.has(body.problem) ? body.problem : null;
  const status = Number.isInteger(body?.status) ? Math.min(Math.max(Number(body?.status), 0), 999) : null;
  const attempts = Number.isInteger(body?.attempts) ? Math.min(Math.max(Number(body?.attempts), 0), 99) : null;
  if (!problem || status === null || attempts === null) {
    return NextResponse.json({ error: "invalid_report" }, { status: 400, headers: NO_STORE });
  }

  console.warn("[/api/mobile/scan-problem]", { problem, status, attempts });
  // Every try is in the logs; Sentry gets a scan's first try, its last
  // (the app's MAX_ATTEMPTS, mobile/src/lib/scans/queue.ts) and final
  // outcomes, so an outage can't use up the quota on retries.
  if (attempts <= 1 || attempts >= APP_MAX_ATTEMPTS || problem === "missing" || problem === "refused") {
    Sentry.captureMessage(`iPhone scan upload: ${problem}`, {
      level: "warning",
      tags: { area: "ios-scan-upload", problem, status: String(status) },
      extra: { attempts },
    });
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
