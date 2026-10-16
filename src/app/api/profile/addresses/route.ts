// POST/DELETE /api/profile/addresses — the user's own email addresses for
// the receipt ownership check (user_email_addresses). An Uber/Stripe
// receipt is trusted automatically only when it was originally sent to one
// of these, the account email or the forwarding alias. Self-declared: the
// list only affects the caller's own receipts. Service role, scoped to the
// caller; capped at MAX_EXTRA_ADDRESSES.

import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidAddress } from "@/lib/email-address";
import { INBOUND_DOMAIN_DEFAULT } from "@/lib/email-alias";
import { MAX_EXTRA_ADDRESSES } from "@/lib/owner-addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readAddress(request: NextRequest): Promise<string | null> {
  try {
    const body = (await request.json()) as { address?: unknown };
    if (typeof body.address !== "string") return null;
    const address = body.address.trim().toLowerCase();
    if (address.length > 254 || !isValidAddress(address)) return null;
    const domain = address.slice(address.lastIndexOf("@") + 1);
    const inbound = (process.env.INBOUND_DOMAIN || INBOUND_DOMAIN_DEFAULT).toLowerCase();
    // Forwarding aliases are already covered; listing one makes no sense.
    return domain === inbound ? null : address;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const address = await readAddress(request);
  if (!address) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { count, error: countError } = await db
    .from("user_email_addresses")
    .select("address", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    console.error("[/api/profile/addresses] count failed", countError.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_EXTRA_ADDRESSES) {
    return NextResponse.json({ error: `You can add up to ${MAX_EXTRA_ADDRESSES} addresses.` }, { status: 400 });
  }

  const { error } = await db
    .from("user_email_addresses")
    .upsert({ user_id: user.id, address }, { onConflict: "user_id,address", ignoreDuplicates: true });
  if (error) {
    console.error("[/api/profile/addresses] insert failed", error.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, address });
}

export async function DELETE(request: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const address = await readAddress(request);
  if (!address) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("user_email_addresses")
    .delete()
    .eq("user_id", user.id)
    .eq("address", address);
  if (error) {
    console.error("[/api/profile/addresses] delete failed", error.code);
    return NextResponse.json({ error: "Couldn't remove. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
