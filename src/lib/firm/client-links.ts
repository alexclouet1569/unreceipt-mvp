// SERVER-ONLY. The accounting-firm links a customer sees in Settings:
// firm invites addressed to their confirmed email, the invite their company
// sent to an accountant (still waiting), and the firm connected to any
// organisation they belong to.

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./../supabase-admin";
import { normalizedSessionEmail } from "./../email-address";
import { formatInstantDate } from "./../receipt-format";
import type { AccountantLink } from "@/app/app/(authed)/settings/AccountantSection";

type Row = {
  id: string;
  status: string;
  accepted_at: string | null;
  invited_email: string;
  weekly_reminder?: boolean | null;
  reminders_opted_out_at?: string | null;
  firms: { name: string } | { name: string }[] | null;
};

function firmName(row: Row): string {
  const f = Array.isArray(row.firms) ? row.firms[0] : row.firms;
  return f?.name ?? "Your accounting firm";
}

export async function loadAccountantLinks(user: User): Promise<AccountantLink[]> {
  const db = getSupabaseAdmin();
  const select = "id, status, accepted_at, invited_email, weekly_reminder, reminders_opted_out_at, firms(name)";

  const { data: memberships } = await db
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id);
  const organizationIds = (memberships ?? []).map((m) => m.organization_id as string);

  // Invites are stored normalised (normalizeAddress): compare the same way.
  const email = normalizedSessionEmail(user);

  const now = new Date().toISOString();
  const none = Promise.resolve({ data: [] as unknown[], error: null });
  const [active, invited, sent] = await Promise.all([
    organizationIds.length > 0
      ? db.from("firm_clients").select(select).eq("status", "active").in("organization_id", organizationIds)
      : none,
    // Only invites a firm sent: a client-sent invite addressed to this user
    // (an accountant who is also a customer) belongs to the firm side.
    email
      ? db
          .from("firm_clients")
          .select(select)
          .eq("status", "invited")
          .eq("direction", "firm")
          .eq("invited_email", email)
          .gt("invite_expires_at", now)
      : none,
    organizationIds.length > 0
      ? db
          .from("firm_clients")
          .select(select)
          .eq("status", "invited")
          .eq("direction", "client")
          .in("organization_id", organizationIds)
          .gt("invite_expires_at", now)
      : none,
  ]);
  if (active.error || invited.error || sent.error) {
    console.error("[accountant-links] load failed", active.error?.code ?? invited.error?.code ?? sent.error?.code);
  }

  const toLink = (r: Row, status: AccountantLink["status"]): AccountantLink => ({
    id: r.id,
    firmName: firmName(r),
    status,
    since: status === "active" && r.accepted_at ? formatInstantDate(r.accepted_at) : null,
    acceptedAt: status === "active" ? r.accepted_at : null,
    ...(status === "active"
      ? { reminders: { optedOut: Boolean(r.reminders_opted_out_at), firmOn: r.weekly_reminder !== false } }
      : {}),
  });
  return [
    ...((active.data ?? []) as Row[]).map((r) => toLink(r, "active")),
    ...((invited.data ?? []) as Row[]).map((r) => toLink(r, "invited")),
    // The accountant hasn't answered yet: show the address it went to.
    ...((sent.data ?? []) as Row[]).map((r) => ({ ...toLink(r, "sent"), firmName: r.invited_email })),
  ];
}
