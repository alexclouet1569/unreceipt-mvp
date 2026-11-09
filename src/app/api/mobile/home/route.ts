// GET /api/mobile/home — the native iPhone app's home screen in one call
// (mobile/, docs/plans/unreceipt-ios-native-plan.md). Same loader as the
// website's /app page (src/lib/home/load-home.ts), so both follow the same
// firm-only and subscription rules. The app signs in with
// `Authorization: Bearer <access token>` (getServerUser()).

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { loadHome } from "@/lib/home/load-home";
import { toMobileReceipt } from "@/lib/mobile/receipt";
import type { MobileHome } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const email = user.email ?? "";

  let body: MobileHome;
  try {
    // No Stripe session id: Checkout never runs inside the app.
    const home = await loadHome(user, null);
    if (home.kind === "firm_only") {
      body = { state: "firm_only", email };
    } else if (home.kind !== "ready") {
      body = { state: "inactive", email };
    } else {
      const d = home.data;
      body = {
        state: "ready",
        email,
        access: home.access,
        homeCurrency: d.homeCurrency,
        forwardingEmail: d.forwardingEmail,
        showOnboarding: d.showOnboarding,
        accountantInvites: d.accountantInvites,
        receipts: d.receipts.map(toMobileReceipt),
      };
    }
  } catch (err) {
    console.error("[/api/mobile/home] failed", err);
    Sentry.captureException(err, { tags: { area: "mobile home" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(body, { headers: NO_STORE });
}
