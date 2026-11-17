// The approval rules inside a company (2026-11-15 "Company team" block),
// pure so they are tested and shared by every route. Client-safe: no I/O.
//
// Who: an owner's receipts need no approval (a sole owner has nobody to ask;
// the accountant is the check). An employee ("member") or an approver sends
// theirs for approval. Their approver is memberships.approver_id when that
// person is still an owner or approver of the company, else the owners.
// Nobody approves their own receipt. An owner may decide on anyone's.
//
// What: draft → submitted → approved | sent_back | rejected. A sent-back
// receipt is fixed and sent again. Changing what was approved (amount,
// currency, date, merchant, paid by) sends it back to submitted. Once the
// owner has paid an outlay back, what was approved is fixed: the amount
// paid must stay the amount on the receipt (founder decision 2026-11-17).

import type { ApprovalStatus, MembershipRole, PaidBy } from "@/lib/types";

export type TeamMember = { userId: string; role: MembershipRole; approverId: string | null };

/** True when this role's receipts go through approval. */
export function needsApproval(role: MembershipRole | null | undefined): boolean {
  return role === "approver" || role === "member";
}

/** Who approves `member`'s receipts (user ids, never the member). */
export function approversOf(member: TeamMember, team: TeamMember[]): string[] {
  if (!needsApproval(member.role)) return [];
  const assigned = member.approverId ? team.find((m) => m.userId === member.approverId) : undefined;
  if (assigned && assigned.userId !== member.userId && (assigned.role === "owner" || assigned.role === "approver")) {
    return [assigned.userId];
  }
  return team.filter((m) => m.role === "owner" && m.userId !== member.userId).map((m) => m.userId);
}

/** May `actorId` approve, send back or reject a receipt of `ownerId`? */
export function canDecide(actorId: string, ownerId: string, team: TeamMember[]): boolean {
  if (actorId === ownerId) return false;
  const actor = team.find((m) => m.userId === actorId);
  const owner = team.find((m) => m.userId === ownerId);
  if (!actor || !owner || !needsApproval(owner.role)) return false;
  if (actor.role === "owner") return true;
  return actor.role === "approver" && approversOf(owner, team).includes(actorId);
}

export type Decision = "approve" | "send_back" | "reject";

export type Transition =
  | { ok: true; status: ApprovalStatus }
  | { ok: false; reason: "wrong_state" | "comment_required" | "incomplete" };

/** Sending for approval: a draft or a sent-back receipt with merchant, amount and date. */
export function submitTransition(status: ApprovalStatus | null | undefined, complete: boolean): Transition {
  if (status !== "draft" && status !== "sent_back") return { ok: false, reason: "wrong_state" };
  if (!complete) return { ok: false, reason: "incomplete" };
  return { ok: true, status: "submitted" };
}

/** The approver's answer. Sending back or rejecting says why. */
export function decisionTransition(
  status: ApprovalStatus | null | undefined,
  decision: Decision,
  comment: string | null | undefined
): Transition {
  if (status !== "submitted") return { ok: false, reason: "wrong_state" };
  const why = (comment ?? "").trim();
  if (decision !== "approve" && why.length === 0) return { ok: false, reason: "comment_required" };
  return { ok: true, status: decision === "approve" ? "approved" : decision === "send_back" ? "sent_back" : "rejected" };
}

/** The fields an approval is about: changing one after approval asks again. */
// receipt_date, not purchased_at: an edit writes the day as "…T12:00:00.000Z"
// while the database returns "+00:00", which would always look changed.
// home_total / home_currency: what is paid back is the amount in the
// company's currency, so a typed one asks again too (security review
// 2026-11-15). The VAT fields: what the accountant books.
export const APPROVED_FIELDS = [
  "total",
  "currency",
  "receipt_date",
  "merchant_name",
  "paid_by",
  "home_total",
  "home_currency",
  "tax_amount",
  "tax_rate",
  "vat_lines",
] as const;

/** True when one of the changed columns is part of what was approved. */
export function touchesApproved(changed: ReadonlyArray<string>): boolean {
  return changed.some((f) => (APPROVED_FIELDS as ReadonlyArray<string>).includes(f));
}

/** After an edit by the receipt's owner: the new status, or null to keep it. */
export function statusAfterEdit(
  status: ApprovalStatus | null | undefined,
  changed: ReadonlyArray<string>
): ApprovalStatus | null {
  if (status !== "approved") return null;
  return touchesApproved(changed) ? "submitted" : null;
}

/**
 * An outlay already paid back: its owner may no longer change what was
 * approved (the route answers 409 "reimbursed"); notes and category stay
 * editable. Reopening it would leave the payment recorded against an
 * amount nobody paid, and "To pay back" lists only unpaid outlays.
 */
export function lockedAfterPayback(
  r: { approval_status?: ApprovalStatus | null; reimbursed_at?: string | null },
  changed: ReadonlyArray<string>
): boolean {
  return r.approval_status === "approved" && Boolean(r.reimbursed_at) && touchesApproved(changed);
}

/** The employee may edit everything but a rejected receipt (the decision stands). */
export function ownerMayEdit(status: ApprovalStatus | null | undefined): boolean {
  return status !== "rejected";
}

/**
 * The employee may delete a receipt nobody has decided on yet, or one sent
 * back or rejected. Not while it waits for a decision, nor once approved:
 * the company has relied on it.
 */
export function ownerMayDelete(status: ApprovalStatus | null | undefined): boolean {
  return status !== "submitted" && status !== "approved";
}

/** An approved outlay the company still owes the employee. */
export function owedToEmployee(r: {
  approval_status?: ApprovalStatus | null;
  paid_by?: PaidBy | null;
  reimbursed_at?: string | null;
}): boolean {
  return r.approval_status === "approved" && r.paid_by === "employee" && !r.reimbursed_at;
}

/** A comment as stored: trimmed, at most 1,000 characters, null when empty. */
export function cleanComment(raw: string | null | undefined): string | null {
  const t = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
  return t.length > 0 ? t : null;
}
