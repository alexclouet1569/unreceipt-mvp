// SERVER-ONLY (service role). The addresses that count as the user's own
// for the receipt ownership check: their personal inboxes (the account
// email plus any listed in user_email_addresses) and, separately, their
// forwarding alias.

import { getSupabaseAdmin } from "./supabase-admin";

export const MAX_EXTRA_ADDRESSES = 10;

export async function loadOwnerAddresses(
  userId: string,
  aliasAddress: string,
): Promise<{ personal: string[]; alias: string }> {
  const db = getSupabaseAdmin();
  const [account, extra] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("user_email_addresses").select("address").eq("user_id", userId),
  ]);
  const personal: string[] = [];
  const email = account.data?.user?.email;
  if (email) personal.push(email);
  for (const row of (extra.data ?? []) as { address: string }[]) personal.push(row.address);
  // A failed lookup only means fewer addresses: receipts then land in
  // Review needed instead of being trusted, never the other way round.
  if (account.error) console.error("[owner-addresses] account lookup failed", account.error.status);
  if (extra.error) console.error("[owner-addresses] address lookup failed", extra.error.code);
  return { personal, alias: aliasAddress };
}

export async function listExtraAddresses(userId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_email_addresses")
    .select("address")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[owner-addresses] list failed", error.code);
    return [];
  }
  return ((data ?? []) as { address: string }[]).map((r) => r.address);
}
