// SERVER-ONLY. accounting_connections and accounting_settings, read and
// written with the service role. Callers have already decided the actor
// may act for `organizationId` (src/lib/accounting/permissions.ts).

import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AccountingConnection, AccountingSettings } from "@/lib/types";

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

/** That Fortnox company is already connected to another UnReceipt company. */
export class TenantTakenError extends Error {
  constructor() {
    super("this Fortnox company is connected to another company");
    this.name = "TenantTakenError";
  }
}

/** Saves (or replaces, on reconnect) the organisation's Fortnox connection. */
export async function saveConnection(
  input: {
    organizationId: string;
    userId: string;
    tenantId: string;
    companyName: string | null;
    companyOrgNumber: string | null;
    /** The Fortnox company's org number matched the one UnReceipt knows. */
    confirmed: boolean;
  },
  client?: SupabaseClient,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db(client)
    .from("accounting_connections")
    .upsert(
      {
        organization_id: input.organizationId,
        provider: "fortnox",
        tenant_id: input.tenantId,
        status: "active",
        company_name: input.companyName,
        company_org_number: input.companyOrgNumber,
        connected_by: input.userId,
        // A new grant: proposals approved against the old one won't post.
        grant_id: randomUUID(),
        confirmed_at: input.confirmed ? now : null,
        confirmed_by: input.confirmed ? input.userId : null,
        last_error: null,
      },
      { onConflict: "organization_id,provider" },
    );
  if (error?.code === "23505") throw new TenantTakenError();
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
  values: Pick<AccountingSettings, "voucher_series" | "credit_account_company" | "credit_account_employee" | "vat_status">,
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

/** Fortnox refused the company's consent: it must connect again. */
export async function markNeedsReconnect(
  conn: Pick<AccountingConnection, "id" | "tenant_id" | "grant_id">,
  client?: SupabaseClient,
): Promise<void> {
  // Only the grant the refusal was for: a reconnect saved meanwhile (new
  // tenant or grant on the same row) stays active.
  const { error } = await db(client)
    .from("accounting_connections")
    .update({ status: "needs_reconnect", last_error: "consent_gone" })
    .eq("id", conn.id)
    .eq("tenant_id", conn.tenant_id)
    .eq("grant_id", conn.grant_id);
  if (error) throw new AccountingStoreError("mark_reconnect", error.code);
}

/** A person confirmed the Fortnox company is this company's. */
export async function confirmConnection(
  organizationId: string,
  userId: string,
  grantId: string,
  client?: SupabaseClient,
): Promise<AccountingConnection | null> {
  // Only the connection the person saw (grant_id): a reconnect meanwhile
  // must be confirmed on its own.
  const { data, error } = await db(client)
    .from("accounting_connections")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: userId })
    .eq("organization_id", organizationId)
    .eq("provider", "fortnox")
    .eq("status", "active")
    .eq("grant_id", grantId)
    .select("*");
  // Another company has already confirmed this Fortnox company.
  if (error?.code === "23505") throw new TenantTakenError();
  if (error) throw new AccountingStoreError("confirm", error.code);
  return ((data ?? []) as AccountingConnection[])[0] ?? null;
}
