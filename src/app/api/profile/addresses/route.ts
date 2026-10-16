// POST/DELETE /api/profile/addresses — the user's own email addresses for
// the receipt ownership check (user_email_addresses). An Uber/Stripe
// receipt is trusted automatically only when it was originally sent to one
// of these, the account email or the forwarding alias. Self-declared: the
// list only affects the caller's own receipts. Service role, scoped to the
// caller; capped at MAX_EXTRA_ADDRESSES (count-then-insert, so parallel
// requests can overshoot slightly; that only affects the caller).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeAddress } from "@/lib/email-address";
import { INBOUND_DOMAIN_DEFAULT } from "@/lib/email-alias";
import { MAX_EXTRA_ADDRESSES } from "@/lib/owner-addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ address: z.string().max(320) });

// The mailbox as stored and compared: normalised, so "Anna.S@Gmail.com"
// and "annas@gmail.com" are one row, and checks run on the real address
// rather than on a display name around it.
async function readAddress(request: NextRequest): Promise<string | null> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return null;
  const address = normalizeAddress(parsed.data.address);
  if (!address) return null;
  const domain = address.slice(address.lastIndexOf("@") + 1);
  const inbound = (process.env.INBOUND_DOMAIN || INBOUND_DOMAIN_DEFAULT).toLowerCase();
  // Forwarding aliases are handled separately; listing one makes no sense.
  return domain === inbound ? null : address;
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
