// GET /api/mobile/analytics — the Insights screen for one period (the
// iPhone app's Insights tab; the website's /app/insights reads the same
// loader). ?period=month|quarter|year|custom with &anchor= ("2026-11",
// "2026-Q4", "2026") or &from=&to= (custom). Without an anchor: the period
// that holds today. Ready-to-show numbers only; text is the app's.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { AnalyticsInputError, loadAnalytics, periodFromParams, todayInStockholm } from "@/lib/analytics/load";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const today = todayInStockholm();
  let period;
  try {
    period = periodFromParams(new URL(request.url).searchParams, today);
  } catch (err) {
    if (err instanceof AnalyticsInputError) {
      return NextResponse.json({ error: "invalid_period" }, { status: 400, headers: NO_STORE });
    }
    throw err;
  }

  const limited = await rateLimit("analytics", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const body = await loadAnalytics(user, period, today);
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/analytics] failed", err);
    Sentry.captureException(err, { tags: { area: "analytics" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
