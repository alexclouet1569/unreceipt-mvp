// GET /api/mobile/home — the native iPhone app's home screen in one call
// (mobile/, docs/plans/unreceipt-ios-native-plan.md). Same loader as the
// website's /app page (src/lib/home/load-home.ts), so both follow the same
// firm-only and subscription rules. A firm seat waiting for this address,
// with no company, answers firm_only without a firm: the app says to join on
// the website, and no company is created, which would make the account a
// company account that can no longer join (src/lib/account-roles.ts). The
// app signs in with
// `Authorization: Bearer <access token>` (getServerUser()).

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { loadHome } from "@/lib/home/load-home";
import { toMobileReceipt } from "@/lib/mobile/receipt";
import { getFirmMembership } from "@/lib/require-firm";
import type { MobileFirmRef, MobileHome } from "@/lib/mobile/types";

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
    const [home, membership] = await Promise.all([
      loadHome(user, null, { askAboutFirmSeat: true }),
      getFirmMembership(user.id),
    ]);
    // The Clients tab: a claimed seat only (a waiting one is joined on the web).
    const firm: MobileFirmRef | null = membership ? { name: membership.firmName, role: membership.role } : null;
    if (home.kind === "firm_only") {
      body = { state: "firm_only", email, firm };
    } else if (home.kind === "firm_pending") {
      body = { state: "firm_only", email, firm: null };
    } else if (home.kind !== "ready") {
      body = { state: "inactive", email };
    } else {
      const d = home.data;
      if (d.forwardingEmail === null) {
        // The address couldn't be created on this load. Never show one that
        // doesn't route: answer "try again" and the app keeps what it showed.
        return NextResponse.json(
          { error: "server_error" },
          { status: 503, headers: { ...NO_STORE, "Retry-After": "5" } }
        );
      }
      body = {
        state: "ready",
        email,
        access: home.access,
        homeCurrency: d.homeCurrency,
        forwardingEmail: d.forwardingEmail,
        showOnboarding: d.showOnboarding,
        accountantInvites: d.accountantInvites,
        firm,
        team: d.team,
        receipts: d.receipts.map(toMobileReceipt),
        ...(d.older ? { older: d.older } : {}),
      };
    }
  } catch (err) {
    console.error("[/api/mobile/home] failed", err);
    Sentry.captureException(err, { tags: { area: "mobile home" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(body, { headers: NO_STORE });
}
