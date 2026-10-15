// POST /api/profile/onboarded — the first-run screens on /app were finished
// or skipped (launch plan action 47). Writes profiles.onboarded_at with the
// service role, scoped to the caller; users have no UPDATE grant on that
// column. Idempotent: an existing timestamp is kept.

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("onboarded_at", null);

  if (error) {
    console.error("[/api/profile/onboarded] update failed", error.code);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
