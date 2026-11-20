// SERVER-ONLY. merchant_account_memory: the expense account a company's
// people approved for a merchant, the agent's first choice next time
// (after a person's or the firm's own choice). One account per merchant:
// approving another account replaces it. Keyed by merchantKey() (Insights'
// conservative grouping: "ICA KVANTUM AB" and "Ica Kvantum" are one).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { merchantKey } from "@/lib/analytics/merchants";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const db = (client?: SupabaseClient) => client ?? getSupabaseAdmin();

export function memoryKey(merchant: string | null | undefined): string | null {
  const key = merchantKey(merchant);
  return key ? key.slice(0, 120) : null;
}

/** The remembered account, or null (a read failure counts as no memory). */
export async function rememberedAccount(
  organizationId: string,
  merchant: string | null | undefined,
  client?: SupabaseClient,
): Promise<string | null> {
  const key = memoryKey(merchant);
  if (!key) return null;
  const { data, error } = await db(client)
    .from("merchant_account_memory")
    .select("account")
    .eq("organization_id", organizationId)
    .eq("merchant_key", key)
    .maybeSingle();
  if (error || !data) return null;
  return (data.account as string) ?? null;
}

/** Up to 20 recent choices, as examples for the model. */
export async function recentChoices(
  organizationId: string,
  client?: SupabaseClient,
): Promise<Array<{ merchant: string; account: string }>> {
  const { data, error } = await db(client)
    .from("merchant_account_memory")
    .select("merchant_key, account")
    .eq("organization_id", organizationId)
    .order("last_used_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((r) => ({ merchant: r.merchant_key as string, account: r.account as string }));
}

/** Records an approved choice. Best effort: a failed write only loses a hint. */
export async function rememberChoice(
  organizationId: string,
  merchant: string | null | undefined,
  account: string,
  client?: SupabaseClient,
): Promise<void> {
  const key = memoryKey(merchant);
  if (!key || !/^[0-9]{4}$/.test(account)) return;
  const c = db(client);
  const { data } = await c
    .from("merchant_account_memory")
    .select("account, uses")
    .eq("organization_id", organizationId)
    .eq("merchant_key", key)
    .maybeSingle();
  const uses = data && data.account === account ? Number(data.uses ?? 0) + 1 : 1;
  const { error } = await c.from("merchant_account_memory").upsert(
    { organization_id: organizationId, merchant_key: key, account, uses, last_used_at: new Date().toISOString() },
    { onConflict: "organization_id,merchant_key" },
  );
  if (error) console.error("[accounting] memory write failed", error.code);
}
