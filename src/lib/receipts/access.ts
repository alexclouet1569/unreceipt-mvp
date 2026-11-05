// SERVER-ONLY. Who may see a receipt: its owner, or staff of the accounting
// firm actively linked to the receipt's organisation. One helper so PATCH,
// /pdf and /original answer the same way. A receipt the caller may not see
// is indistinguishable from one that doesn't exist (null → 404), so ids
// can't be probed.

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../supabase-admin";
import type { Receipt } from "../types";

export class ReceiptAccessError extends Error {
  constructor(message = "receipt lookup failed") {
    super(message);
    this.name = "ReceiptAccessError";
  }
}

export type ReceiptAccess =
  | { receipt: Receipt; via: "owner" }
  | { receipt: Receipt; via: "firm"; firmId: string };

/**
 * Reads the receipt with the service role and decides whether `user` may
 * see it. Throws ReceiptAccessError on a database failure (callers answer
 * 500), returns null when the row doesn't exist or isn't the caller's to
 * see.
 */
export async function loadReceiptForActor(
  user: Pick<User, "id">,
  receiptId: string
): Promise<ReceiptAccess | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw new ReceiptAccessError();
  if (!data) return null;
  const receipt = data as Receipt;

  if (receipt.user_id === user.id) return { receipt, via: "owner" };
  if (!receipt.organization_id) return null;

  // Firm staff: the session user's firm must hold an active link to the
  // receipt's organisation.
  const { data: member, error: memberError } = await db
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) throw new ReceiptAccessError();
  if (!member) return null;
  const firmId = member.firm_id as string;

  const { data: link, error: linkError } = await db
    .from("firm_clients")
    .select("id")
    .eq("firm_id", firmId)
    .eq("organization_id", receipt.organization_id)
    .eq("status", "active")
    .maybeSingle();
  if (linkError) throw new ReceiptAccessError();
  if (!link) return null;

  return { receipt, via: "firm", firmId };
}
