import { requireFirmMemberPage } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { FirmMember } from "@/lib/types";
import { MembersSection } from "./MembersSection";

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
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1
          className="font-display font-bold text-[var(--ink)]"
          style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
        >
          {ctx.firmName}
        </h1>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
          Signed in as {ctx.user.email ?? "you"} · {ctx.role === "admin" ? "admin" : "staff"}
        </p>
      </div>

      <section aria-labelledby="members-heading">
        <h2
          id="members-heading"
          className="uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "8px" }}
        >
          People in the firm
        </h2>
        <MembersSection
          members={members.map((m) => ({
            id: m.id,
            email: m.email,
            role: m.role,
            claimed: Boolean(m.user_id),
          }))}
          isAdmin={ctx.role === "admin"}
          selfId={ctx.memberId}
        />
      </section>
    </div>
  );
}
