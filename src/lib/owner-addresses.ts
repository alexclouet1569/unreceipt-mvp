// SERVER-ONLY (service role). The addresses that count as the user's own
// for the receipt ownership check: the account email, the forwarding alias
// and any address the user listed in user_email_addresses.

import { getSupabaseAdmin } from "./supabase-admin";

export const MAX_EXTRA_ADDRESSES = 10;

export async function loadOwnerAddresses(userId: string, aliasAddress: string): Promise<string[]> {
  const db = getSupabaseAdmin();
  const [account, extra] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("user_email_addresses").select("address").eq("user_id", userId),
  ]);
  const addresses = [aliasAddress];
  const email = account.data?.user?.email;
  if (email) addresses.push(email);
  for (const row of (extra.data ?? []) as { address: string }[]) addresses.push(row.address);
  // A failed lookup only means fewer addresses: receipts then land in
  // Review needed instead of being trusted, never the other way round.
  if (account.error) console.error("[owner-addresses] account lookup failed", account.error.status);
  if (extra.error) console.error("[owner-addresses] address lookup failed", extra.error.code);
  return addresses;
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
