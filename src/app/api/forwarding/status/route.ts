// GET /api/forwarding/status — what the forwarding setup wizard waits for:
// Gmail's confirmation (link, or code in the older format, if one arrived
// in the last 7 days) and when the
// latest email reached this user's forwarding address (the "send a test"
// step). Read-only, scoped to the caller.

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CONFIRMATION_MAX_AGE_MS, isGmailConfirmUrl } from "@/lib/forwarding-confirmation";
import { isOwnInbox } from "@/lib/forwarding-autoconfirm";
import { listExtraAddresses } from "@/lib/owner-addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  const [confirmation, latestEmail] = await Promise.all([
    db
      .from("email_forwarding_confirmations")
      // "*" rather than a column list: auto_confirmed_at (2026-11-08) and
      // confirm_url (2026-11-13) may not exist where schema.sql wasn't
      // re-applied.
      .select("*")
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

  const row = confirmation.data as {
    code: string | null;
    for_address: string | null;
    received_at: string;
    auto_confirmed_at?: string | null;
    confirm_url?: string | null;
  } | null;
  const fresh = row && Date.now() - Date.parse(row.received_at) <= CONFIRMATION_MAX_AGE_MS;
  // Anyone who knows the alias can make Gmail send this email for their own
  // account. The link is offered only when we know which Gmail asks (so the
  // guide can name it), and ownInbox says whether that's one of this user's
  // addresses (sign-in email or ones they listed), so the guide can warn.
  const forAddress = fresh ? row.for_address : null;
  const ownInbox = forAddress
    ? isOwnInbox(forAddress, [...(user.email ? [user.email] : []), ...(await listExtraAddresses(user.id))])
    : null;
  return NextResponse.json(
    {
      confirmation: fresh
        ? {
            code: row.code,
            forAddress: row.for_address,
            receivedAt: row.received_at,
            autoConfirmed: Boolean(row.auto_confirmed_at),
            // Re-checked on the way out: only Gmail's own page is ever shown.
            confirmUrl: forAddress && isGmailConfirmUrl(row.confirm_url) ? row.confirm_url : null,
            ownInbox,
          }
        : null,
      lastEmailAt: (latestEmail.data as { created_at: string } | null)?.created_at ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
