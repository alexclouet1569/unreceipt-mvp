// GET /api/receipts/search?q=&month=YYYY-MM|year=YYYY&after=<listKey> —
// receipt search and the month filter on the website's receipts list
// (src/lib/home/search.ts). The website's Receipt rows, converted to the
// company's currency like the list, in the list's order, 50 at a time;
// `after` (src/lib/mobile/receipt.ts listKeyOf) continues a page. Same
// access rules as the home screen (analyticsAccess), scoped by user_id,
// rate limited (receiptSearch). The iPhone app asks GET /api/mobile/receipts
// with the same parameters.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { analyticsAccess } from "@/lib/analytics/load";
import { ensureHomeAmounts } from "@/lib/fx";
import { parseListCursor } from "@/lib/home/load-home";
import { parseReceiptSearch, searchReceipts } from "@/lib/home/search";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import type { Receipt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

export type ReceiptSearchResponse = { receipts: Receipt[]; hasMore: boolean };

export async function GET(request: Request) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const params = new URL(request.url).searchParams;
  const search = parseReceiptSearch(params);
  const rawAfter = params.get("after");
  const cursor = rawAfter ? parseListCursor(rawAfter) : null;
  if (search === null || search === "invalid" || (rawAfter && !cursor)) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  }

  const limited = await rateLimit("receiptSearch", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const access = await analyticsAccess(user);
    if (access.kind !== "ready") {
      return NextResponse.json({ error: access.kind }, { status: 403, headers: NO_STORE });
    }
    const page = await searchReceipts(user.id, search, cursor);
    const receipts = await ensureHomeAmounts(page.receipts, access.home).catch(() => page.receipts);
    const body: ReceiptSearchResponse = { receipts, hasMore: page.hasMore };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/receipts/search] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "receipt search" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
