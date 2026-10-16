// GET /api/forwarding/status — what the forwarding setup wizard waits for:
// Gmail's confirmation code (if one arrived in the last 7 days) and when the
// latest email reached this user's forwarding address (the "send a test"
// step). Read-only, scoped to the caller.

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CONFIRMATION_MAX_AGE_MS } from "@/lib/forwarding-confirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  const [confirmation, latestEmail] = await Promise.all([
    db
      .from("email_forwarding_confirmations")
      .select("code, for_address, received_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("receipts")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("source", "email")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (confirmation.error || latestEmail.error) {
    console.error(
      "[/api/forwarding/status] load failed",
      confirmation.error?.code ?? latestEmail.error?.code,
    );
    return NextResponse.json({ error: "load failed" }, { status: 500 });
  }

  const row = confirmation.data as { code: string | null; for_address: string | null; received_at: string } | null;
  const fresh = row && Date.now() - Date.parse(row.received_at) <= CONFIRMATION_MAX_AGE_MS;
  return NextResponse.json(
    {
      confirmation: fresh
        ? { code: row.code, forAddress: row.for_address, receivedAt: row.received_at }
        : null,
      lastEmailAt: (latestEmail.data as { created_at: string } | null)?.created_at ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
