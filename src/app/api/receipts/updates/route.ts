// GET /api/receipts/updates?after=<created_at>&rows=web|mobile — "anything
// new?" (src/lib/receipts/updates.ts), asked every ~20 s by the website's
// receipts list while the tab is visible and by the iPhone app while it is
// in the foreground. Signed in (cookie or bearer), the user's own receipts
// only (user_id), rate limited (receiptUpdates).
//
// With `rows` and new email receipts, their rows come along so the notice
// can open them even when they sit beyond the list's newest 50 (a receipt
// dated last month arrives today): `web` the website's Receipt rows,
// `mobile` the app's display JSON, both converted to the company's
// currency like the list. Rows follow the home screen's access rules
// (analyticsAccess): without access only the ids are sent.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { analyticsAccess } from "@/lib/analytics/load";
import { ensureHomeAmounts } from "@/lib/fx";
import { toMobileReceipt } from "@/lib/mobile/receipt";
import type { MobileReceiptUpdates } from "@/lib/mobile/types";
import { loadReceiptUpdates, parseAfter } from "@/lib/receipts/updates";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import type { Receipt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const params = new URL(request.url).searchParams;
  const rawAfter = params.get("after");
  const after = parseAfter(rawAfter);
  const rows = params.get("rows");
  if ((rawAfter != null && after == null) || (rows != null && rows !== "web" && rows !== "mobile")) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  }

  const limited = await rateLimit("receiptUpdates", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const updates = await loadReceiptUpdates(user.id, after);
    let receipts: Receipt[] | undefined;
    if (rows && updates.fresh.length > 0) {
      const access = await analyticsAccess(user);
      if (access.kind === "ready") {
        const { data, error } = await getSupabaseAdmin()
          .from("receipts")
          .select("*")
          .eq("user_id", user.id)
          .in("id", updates.fresh.map((f) => f.id));
        if (error) throw error;
        const found = (data ?? []) as Receipt[];
        receipts = await ensureHomeAmounts(found, access.home).catch(() => found);
      }
    }
    if (rows === "mobile") {
      const body: MobileReceiptUpdates = { ...updates, receipts: receipts?.map(toMobileReceipt) };
      return NextResponse.json(body, { headers: NO_STORE });
    }
    return NextResponse.json({ ...updates, receipts }, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/receipts/updates] failed", err instanceof Error ? err.message : "error");
    Sentry.captureException(err, { tags: { area: "receipt updates" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
