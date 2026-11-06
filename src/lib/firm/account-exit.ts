// What happens to an accounting firm when one of its people deletes their
// account (App Store 5.1.1(v): accountants must be able to delete their
// account in the app, docs/plans/unreceipt-store-apps-plan.md finding 1).
//
//   - Colleagues remain and one of them is an admin → the firm carries on;
//     the person's firm_members row cascades away with auth.users.
//   - The person is the firm's only admin but colleagues remain → the
//     colleague who joined first becomes admin, so the firm can still add
//     people and clients.
//   - Nobody else has signed in to the firm → the firm is deleted. Its
//     pending invites and client links cascade with it; each client's
//     receipts stay in the client's own account. Leaving the firm behind
//     would strand those links: one active firm per client
//     (firm_clients_active_org_unique) means the client could never link
//     another accountant.
//
// Plain functions over a Supabase client passed in by the caller (the
// service-role client in deleteAccount() and on /firm/settings), so the
// types and the notice copy are safe to import into the settings UI.

import type { SupabaseClient } from "@supabase/supabase-js";

export type FirmExitPlan =
  | { kind: "none" }
  | { kind: "stays"; firmId: string; firmName: string }
  | {
      kind: "handover";
      firmId: string;
      firmName: string;
      successorMemberId: string;
      successorEmail: string;
    }
  | { kind: "close"; firmId: string; firmName: string; activeClients: number };

export class FirmExitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirmExitError";
  }
}

type ColleagueRow = {
  id: string;
  email: string;
  role: "admin" | "staff";
  claimed_at: string | null;
  created_at: string;
};

function joinedOrder(a: ColleagueRow, b: ColleagueRow): number {
  const ta = Date.parse(a.claimed_at ?? a.created_at);
  const tb = Date.parse(b.claimed_at ?? b.created_at);
  return ta - tb || a.id.localeCompare(b.id);
}

/** Reads what deleting `userId` would do to their firm. Changes nothing. */
export async function planFirmExit(
  supabase: SupabaseClient,
  userId: string,
): Promise<FirmExitPlan> {
  const { data: me, error: meError } = await supabase
    .from("firm_members")
    .select("id, firm_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (meError) throw new FirmExitError("membership lookup failed");
  if (!me) return { kind: "none" };

  const firmId = me.firm_id as string;
  const { data: firm, error: firmError } = await supabase
    .from("firms")
    .select("name")
    .eq("id", firmId)
    .maybeSingle();
  if (firmError) throw new FirmExitError("firm lookup failed");
  const firmName = (firm?.name as string | undefined) ?? "your firm";

  // Colleagues who have signed in. Pending invites (user_id NULL) don't
  // count: nobody could use the firm until one of them signs in.
  const { data: others, error: othersError } = await supabase
    .from("firm_members")
    .select("id, email, role, claimed_at, created_at")
    .eq("firm_id", firmId)
    .not("user_id", "is", null)
    .neq("id", me.id);
  if (othersError) throw new FirmExitError("colleague lookup failed");
  const colleagues = ((others ?? []) as ColleagueRow[]).sort(joinedOrder);

  if (colleagues.length === 0) {
    const { count, error: countError } = await supabase
      .from("firm_clients")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "active");
    if (countError) throw new FirmExitError("client count failed");
    return { kind: "close", firmId, firmName, activeClients: count ?? 0 };
  }

  if (colleagues.some((c) => c.role === "admin")) {
    return { kind: "stays", firmId, firmName };
  }
  // Only reachable when this person is the sole admin: every firm keeps at
  // least one (the members route refuses to remove yourself).
  const successor = colleagues[0];
  return {
    kind: "handover",
    firmId,
    firmName,
    successorMemberId: successor.id,
    successorEmail: successor.email,
  };
}

/**
 * Carries out the plan. Runs before the auth user is deleted, so a failure
 * stops the deletion and a retry starts over: after a handover the plan
 * reads "stays", after a close it reads "none".
 */
export async function applyFirmExit(
  supabase: SupabaseClient,
  plan: FirmExitPlan,
): Promise<void> {
  if (plan.kind === "close") {
    const { error } = await supabase.from("firms").delete().eq("id", plan.firmId);
    if (error) throw new FirmExitError("firm delete failed");
    return;
  }
  if (plan.kind === "handover") {
    const { error } = await supabase
      .from("firm_members")
      .update({ role: "admin" })
      .eq("id", plan.successorMemberId)
      .eq("firm_id", plan.firmId);
    if (error) throw new FirmExitError("admin handover failed");
  }
}

/** One sentence for the delete-account dialog, or null when there's no firm. */
export function firmExitNotice(plan: FirmExitPlan): string | null {
  switch (plan.kind) {
    case "none":
      return null;
    case "stays":
      return `You'll leave ${plan.firmName}. Your colleagues keep access to every client.`;
    case "handover":
      return `You're the only admin of ${plan.firmName}. ${plan.successorEmail} becomes admin when you leave, and keeps access to every client.`;
    case "close": {
      const clients =
        plan.activeClients === 0
          ? "Nothing else is affected: the firm has no linked clients."
          : `Its link with ${plan.activeClients} client${plan.activeClients === 1 ? "" : "s"} ends. Their receipts stay in their own accounts.`;
      return `You're the only person in ${plan.firmName}, so deleting your account also closes the firm. ${clients}`;
    }
  }
}
