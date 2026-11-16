// POST /api/organization/currency — the company's own currency (2026-11-05).
// Totals, the accountant's export and the "≈" amounts use it; receipts in
// another currency are converted at the ECB rate (src/lib/fx.ts). Changing
// it needs no backfill: every row converted to the old currency is
// converted again on its next read. Only an owner of the company may
// change it.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";
import { HOME_CURRENCY_OPTIONS } from "@/lib/receipt-format";
import { countryForCurrency } from "@/lib/country";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ currency: z.enum(HOME_CURRENCY_OPTIONS) });

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a currency." }, { status: 400 });

  const organizationId = await getOrCreateDefaultOrganization(user.id);
  if (!organizationId) {
    return NextResponse.json({ error: "Couldn't load your company. Try again." }, { status: 500 });
  }
  const db = getSupabaseAdmin();
  const { data: membership } = await db
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Only the company's owner can change this." }, { status: 403 });
  }

  // A currency only one country uses (SEK, PLN…) also moves the company
  // there, so a wrongly guessed country (src/lib/country.ts) is fixed here
  // too: the Swedish VAT view and a new firm's country follow it.
  const { data: org, error: readError } = await db
    .from("organizations")
    .select("country")
    .eq("id", organizationId)
    .maybeSingle();
  if (readError) {
    console.error("[/api/organization/currency] read failed", readError.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  const country =
    typeof org?.country === "string" ? countryForCurrency(parsed.data.currency, org.country) : null;
  const { error } = await db
    .from("organizations")
    .update(country ? { currency: parsed.data.currency, country } : { currency: parsed.data.currency })
    .eq("id", organizationId);
  if (error) {
    console.error("[/api/organization/currency] update failed", error.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, currency: parsed.data.currency });
}
