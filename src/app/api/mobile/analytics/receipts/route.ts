// GET /api/mobile/analytics/receipts — the receipts behind a number on the
// Insights screen: the period's parameters (as /api/mobile/analytics) plus
// at most one of &category=, &merchant= (the normalised key the analytics
// returned), &ids= (comma-separated, from an insight) or &quality=
// (to_complete | unconverted | missing_amount | to_confirm | vat_to_check). Newest first,
// at most 200. Only the signed-in user's own receipts.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import {
  AnalyticsInputError,
  drillFilterFromParams,
  loadDrillReceipts,
  periodFromParams,
  todayInStockholm,
} from "@/lib/analytics/load";
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

  const params = new URL(request.url).searchParams;
  let period;
  let filter;
  try {
    period = periodFromParams(params, todayInStockholm());
    filter = drillFilterFromParams(params);
  } catch (err) {
    if (err instanceof AnalyticsInputError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
    }
    throw err;
  }

  const limited = await rateLimit("analytics", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const result = await loadDrillReceipts(user, period, filter);
    if ("state" in result) {
      return NextResponse.json({ error: result.state }, { status: 403, headers: NO_STORE });
    }
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/analytics/receipts] failed", err);
    Sentry.captureException(err, { tags: { area: "analytics" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
