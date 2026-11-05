// SERVER-ONLY. The accounting-firm links a customer sees in Settings:
// invites addressed to their confirmed email, and the firm connected to any
// organisation they belong to.

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./../supabase-admin";
import { formatDate } from "./../receipt-format";
import type { AccountantLink } from "@/app/app/(authed)/settings/AccountantSection";

type Row = {
  id: string;
  status: string;
  accepted_at: string | null;
  firms: { name: string } | { name: string }[] | null;
};

function firmName(row: Row): string {
  const f = Array.isArray(row.firms) ? row.firms[0] : row.firms;
  return f?.name ?? "Your accounting firm";
}

export async function loadAccountantLinks(user: User): Promise<AccountantLink[]> {
  const db = getSupabaseAdmin();
  const select = "id, status, accepted_at, firms(name)";

  const { data: memberships } = await db
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id);
  const organizationIds = (memberships ?? []).map((m) => m.organization_id as string);

  const email =
    typeof user.email === "string" && user.email_confirmed_at
      ? user.email.trim().toLowerCase()
      : null;

  const [active, invited] = await Promise.all([
    organizationIds.length > 0
      ? db.from("firm_clients").select(select).eq("status", "active").in("organization_id", organizationIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    email
      ? db
          .from("firm_clients")
          .select(select)
          .eq("status", "invited")
          .eq("invited_email", email)
          .gt("invite_expires_at", new Date().toISOString())
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (active.error || invited.error) {
    console.error("[accountant-links] load failed", active.error?.code ?? invited.error?.code);
  }

  const toLink = (r: Row, status: AccountantLink["status"]): AccountantLink => ({
    id: r.id,
    firmName: firmName(r),
    status,
    since: status === "active" && r.accepted_at ? formatDate(r.accepted_at) : null,
  });
  return [
    ...((active.data ?? []) as Row[]).map((r) => toLink(r, "active")),
    ...((invited.data ?? []) as Row[]).map((r) => toLink(r, "invited")),
  ];
}
