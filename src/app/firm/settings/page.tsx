import { requireFirmMemberPage } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { FirmMember } from "@/lib/types";
import { SettingsView } from "../_views";

export const dynamic = "force-dynamic";

type MemberRow = Pick<FirmMember, "id" | "email" | "role" | "claimed_at" | "user_id">;

async function loadMembers(firmId: string): Promise<MemberRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("firm_members")
    .select("id, email, role, claimed_at, user_id")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[/firm/settings] members load failed", error);
    return [];
  }
  return (data ?? []) as MemberRow[];
}

export default async function FirmSettingsPage() {
  const ctx = await requireFirmMemberPage();
  const members = await loadMembers(ctx.firmId);

  return (
    <SettingsView
      firmName={ctx.firmName}
      email={ctx.user.email ?? null}
      role={ctx.role}
      members={members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role,
        claimed: Boolean(m.user_id),
      }))}
      selfId={ctx.memberId}
    />
  );
}
