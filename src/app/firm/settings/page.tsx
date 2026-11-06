import Link from "next/link";
import { requireFirmMemberPage } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hasAnyMembership } from "@/lib/organizations";
import { firmExitNotice, planFirmExit } from "@/lib/firm/account-exit";
import type { FirmMember } from "@/lib/types";
import { DeleteAccountSection } from "@/app/app/(authed)/settings/DeleteAccountSection";
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

// What deleting this account would do to the firm, for the dialog. A failed
// lookup only hides the sentence; the deletion itself re-reads it and stops
// on an error.
async function loadFirmNotice(userId: string): Promise<string | null> {
  try {
    return firmExitNotice(await planFirmExit(getSupabaseAdmin(), userId));
  } catch (err) {
    console.error("[/firm/settings] firm exit lookup failed", err);
    return null;
  }
}

export default async function FirmSettingsPage() {
  const ctx = await requireFirmMemberPage();
  const [members, ownsCompany, firmNotice] = await Promise.all([
    loadMembers(ctx.firmId),
    hasAnyMembership(ctx.user.id),
    loadFirmNotice(ctx.user.id),
  ]);

  // Someone who also has their own company deletes from the company's
  // settings, where the receipt export comes first (Swedish retention).
  const accountSlot = ownsCompany ? (
    <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
      Your account also holds your own company&apos;s receipts. To delete it,
      download them first in{" "}
      <Link
        href="/app/settings"
        className="underline text-[var(--ink)] rounded-[6px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        your company settings
      </Link>
      .
    </p>
  ) : (
    <DeleteAccountSection variant="firm" firmNotice={firmNotice} />
  );

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
      accountSlot={accountSlot}
    />
  );
}
