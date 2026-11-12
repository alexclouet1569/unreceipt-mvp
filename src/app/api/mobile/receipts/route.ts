// GET /api/mobile/receipts?after=<listKey> — "Load more" at the end of the
// iPhone app's receipts list: the next page of receipts after the last one
// shown, in the home list's order (src/lib/home/load-home.ts), as display
// JSON. Same access
// rules as the home screen and Insights (firm-only staff and accounts
// without a plan get nothing), scoped by user_id, converted to the
// company's currency like the list.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { analyticsAccess } from "@/lib/analytics/load";
import { ensureHomeAmounts } from "@/lib/fx";
import { loadOlderReceipts, parseListCursor } from "@/lib/home/load-home";
import { toMobileReceipt } from "@/lib/mobile/receipt";
import type { MobileReceiptsPage } from "@/lib/mobile/types";
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

  const cursor = parseListCursor(new URL(request.url).searchParams.get("after"));
  if (!cursor) {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400, headers: NO_STORE });
  }

  // Shares the Insights budget: both page through the user's receipts.
  const limited = await rateLimit("analytics", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const access = await analyticsAccess(user);
    if (access.kind !== "ready") {
      return NextResponse.json({ error: access.kind }, { status: 403, headers: NO_STORE });
    }
    const page = await loadOlderReceipts(user.id, cursor);
    const converted = await ensureHomeAmounts(page.receipts, access.home).catch(() => page.receipts);
    const body: MobileReceiptsPage = { receipts: converted.map(toMobileReceipt), hasMore: page.hasMore };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/receipts] failed", err);
    Sentry.captureException(err, { tags: { area: "mobile receipts" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
