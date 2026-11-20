// SERVER-ONLY. accounting_connections and accounting_settings, read and
// written with the service role. Callers have already decided the actor
// may act for `organizationId` (src/lib/accounting/permissions.ts).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AccountingConnection, AccountingSettings } from "@/lib/types";
import { encryptAccountingToken } from "./crypto";
import type { FortnoxTokens } from "./fortnox/oauth";
import type { TokenStore } from "./tokens";

export class AccountingStoreError extends Error {
  constructor(step: string, code?: string | null) {
    super(`accounting store: ${step} (${code ?? "unknown"})`);
    this.name = "AccountingStoreError";
  }
}

const db = (client?: SupabaseClient) => client ?? getSupabaseAdmin();

export async function getConnection(
  organizationId: string,
  client?: SupabaseClient,
): Promise<AccountingConnection | null> {
  const { data, error } = await db(client)
    .from("accounting_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "fortnox")
    .maybeSingle();
  if (error) throw new AccountingStoreError("read_connection", error.code);
  return (data as AccountingConnection | null) ?? null;
}

/** Saves (or replaces, on reconnect) the organisation's Fortnox connection. */
export async function saveConnection(
  input: {
    organizationId: string;
    userId: string;
    tokens: FortnoxTokens;
    companyName: string | null;
    companyOrgNumber: string | null;
  },
  client?: SupabaseClient,
): Promise<void> {
  const { organizationId, tokens } = input;
  const now = new Date().toISOString();
  const { error } = await db(client)
    .from("accounting_connections")
    .upsert(
      {
        organization_id: organizationId,
        provider: "fortnox",
        refresh_token_enc: encryptAccountingToken(tokens.refreshToken, organizationId),
        access_token_enc: encryptAccountingToken(tokens.accessToken, organizationId),
        access_expires_at: new Date(tokens.expiresAt).toISOString(),
        refresh_lock_until: null,
        refreshed_at: now,
        status: "active",
        company_name: input.companyName,
        company_org_number: input.companyOrgNumber,
        connected_by: input.userId,
        last_error: null,
      },
      { onConflict: "organization_id,provider" },
    );
  if (error) throw new AccountingStoreError("save_connection", error.code);
}

/** Deletes the connection and returns what was deleted (to revoke it). */
export async function deleteConnection(
  organizationId: string,
  client?: SupabaseClient,
): Promise<AccountingConnection | null> {
  const { data, error } = await db(client)
    .from("accounting_connections")
    .delete()
    .eq("organization_id", organizationId)
    .eq("provider", "fortnox")
    .select("*");
  if (error) throw new AccountingStoreError("delete_connection", error.code);
  return ((data ?? []) as AccountingConnection[])[0] ?? null;
}

export async function getSettings(
  organizationId: string,
  client?: SupabaseClient,
): Promise<AccountingSettings | null> {
  const { data, error } = await db(client)
    .from("accounting_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new AccountingStoreError("read_settings", error.code);
  return (data as AccountingSettings | null) ?? null;
}

export async function saveSettings(
  organizationId: string,
  userId: string,
  values: Pick<AccountingSettings, "voucher_series" | "credit_account_company" | "credit_account_employee">,
  client?: SupabaseClient,
): Promise<AccountingSettings> {
  const { data, error } = await db(client)
    .from("accounting_settings")
    .upsert({ organization_id: organizationId, updated_by: userId, ...values }, { onConflict: "organization_id" })
    .select("*")
    .single();
  if (error || !data) throw new AccountingStoreError("save_settings", error?.code);
  return data as AccountingSettings;
}

/** The Supabase-backed TokenStore used by tokens.ts. */
export function supabaseTokenStore(client?: SupabaseClient): TokenStore {
  const c = () => db(client);
  return {
    async read(id) {
      const { data, error } = await c().from("accounting_connections").select("*").eq("id", id).maybeSingle();
      if (error) throw new AccountingStoreError("read_tokens", error.code);
      return (data as AccountingConnection | null) ?? null;
    },
    async claimLock(id, expectedRefreshEnc, nowIso, untilIso) {
      const { data, error } = await c()
        .from("accounting_connections")
        .update({ refresh_lock_until: untilIso })
        .eq("id", id)
        .eq("refresh_token_enc", expectedRefreshEnc)
        .eq("status", "active")
        // Quoted: a timestamp holds ":" and ".", which PostgREST's logic
        // trees would otherwise have to guess at.
        .or(`refresh_lock_until.is.null,refresh_lock_until.lt."${nowIso}"`)
        .select("id");
      if (error) throw new AccountingStoreError("claim_lock", error.code);
      return (data ?? []).length === 1;
    },
    async saveTokens(id, values) {
      const { error } = await c()
        .from("accounting_connections")
        .update({ ...values, refresh_lock_until: null, last_error: null })
        .eq("id", id);
      if (error) throw new AccountingStoreError("save_tokens", error.code);
    },
    async releaseLock(id) {
      const { error } = await c().from("accounting_connections").update({ refresh_lock_until: null }).eq("id", id);
      if (error) throw new AccountingStoreError("release_lock", error.code);
    },
    async markNeedsReconnect(id, code) {
      const { error } = await c()
        .from("accounting_connections")
        .update({ status: "needs_reconnect", last_error: code, refresh_lock_until: null, access_token_enc: null })
        .eq("id", id);
      if (error) throw new AccountingStoreError("mark_reconnect", error.code);
    },
  };
}
