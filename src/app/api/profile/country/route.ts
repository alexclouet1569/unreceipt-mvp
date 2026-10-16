// POST /api/profile/country — sets profiles.company_country, which decides
// whether receipts get the Swedish VAT check. Body: { country: "SE" | "FR"
// | "OTHER" }. Written with the service role, scoped to the caller; users
// have no UPDATE grant on that column.

import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseCompanyCountry } from "@/lib/company-country";
import { isSameHost } from "@/lib/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Same-origin only: browsers always send Origin on cross-site POSTs, and
  // request.json() would read a text/plain form post too.
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const country = parseCompanyCountry((body as { country?: unknown } | null)?.country);
  if (!country) {
    return NextResponse.json({ error: "unknown country" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ company_country: country })
    .eq("user_id", user.id);

  if (error) {
    console.error("[/api/profile/country] update failed", error.code);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, country });
}
