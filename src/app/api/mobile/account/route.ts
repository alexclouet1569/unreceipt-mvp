// GET /api/mobile/account — the iPhone app's Account tab in one call
// (mobile/, docs/plans/unreceipt-ios-native-plan.md phase 3). Built from the
// same loaders as the website's Settings (src/app/app/(authed)/settings),
// returned as display data for the app (src/lib/mobile/types.ts). The
// changes themselves go through the website's own routes: /api/export,
// /api/organization/currency, /api/accountant/*, /api/account/delete.
// Nothing about plans, prices or usage (App Store 3.1.3(f)).

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultOrganizationId, hasAnyMembership } from "@/lib/organizations";
import { homeCurrencyOf } from "@/lib/fx";
import { CURRENCY_OPTIONS } from "@/lib/receipt-format";
import { loadAccountantLinks } from "@/lib/firm/client-links";
import { planFirmExit, type FirmExitPlan } from "@/lib/firm/account-exit";
import { loadFirstReceiptDate } from "@/lib/receipts/first-date";
import type { MobileAccount, MobileFirmExit } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function toFirmExit(plan: FirmExitPlan): MobileFirmExit | null {
  switch (plan.kind) {
    case "none":
      return null;
    case "stays":
      return { kind: "stays", firmName: plan.firmName };
    case "handover":
      return { kind: "handover", firmName: plan.firmName, successorEmail: plan.successorEmail };
    case "close":
      return { kind: "close", firmName: plan.firmName, activeClients: plan.activeClients };
  }
}

/** Whether this user may change the company's currency (the route checks it again). */
async function isOwner(userId: string, organizationId: string | null): Promise<boolean> {
  // No company yet: the currency route creates it with this user as owner.
  if (!organizationId) return true;
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "owner";
}

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  try {
    const [hasCompany, organizationId, links, firstDate, firmExit] = await Promise.all([
      hasAnyMembership(user.id),
      getDefaultOrganizationId(user.id),
      loadAccountantLinks(user),
      loadFirstReceiptDate(user.id),
      planFirmExit(getSupabaseAdmin(), user.id)
        .then(toFirmExit)
        .catch((err) => {
          console.error("[/api/mobile/account] firm exit lookup failed", err);
          return "unknown" as const;
        }),
    ]);
    const [currency, owner] = hasCompany
      ? await Promise.all([homeCurrencyOf(organizationId), isOwner(user.id, organizationId)])
      : [null, false];

    const body: MobileAccount = {
      email: user.email ?? "",
      hasCompany,
      currency: currency ? { value: currency, options: [...CURRENCY_OPTIONS], canChange: owner } : null,
      accountant: hasCompany
        ? links.map((l) => ({
            id: l.id,
            status: l.status,
            name: l.firmName,
            since: l.acceptedAt ?? null,
            reminders: l.reminders ?? null,
          }))
        : [],
      firstMonth: firstDate ? firstDate.slice(0, 7) : null,
      firmExit,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/account] failed", err);
    Sentry.captureException(err, { tags: { area: "mobile account" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
