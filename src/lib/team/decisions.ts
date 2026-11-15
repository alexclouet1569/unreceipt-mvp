// SERVER-ONLY. Sending a receipt for approval, deciding on it, what waits
// for whom, and paying outlays back (2026-11-15 "Company team" block). The
// rules are in ./rules.ts; this file reads and writes. Every write is
// scoped to the receipt's company and made with a compare-and-set on its
// approval status, so two approvers (or a double tap) can't both decide.
//
// Never import this file from a "use client" component: it uses the
// service-role Supabase client.

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "../supabase-admin";
import { getDefaultOrganizationId } from "../organizations";
import { recordReceiptUsage, usageSource } from "../usage";
import { missingRequiredFields } from "../receipts/status";
import { toMobileReceipt } from "../mobile/receipt";
import type { ApprovalQueueItem, MobileTeam, ReimbursementGroup } from "../mobile/types";
import type { ApprovalAction, PaidBy, Receipt } from "../types";
import { getEmployment, labelOf, loadTeam, peopleById, teamContextFor, TeamReadError } from "./membership";
import {
  approversOf,
  canDecide,
  cleanComment,
  decisionTransition,
  needsApproval,
  owedToEmployee,
  submitTransition,
  type Decision,
  type TeamMember,
} from "./rules";
import { notifyApprovers, notifyDecision } from "./emails";

export type TeamResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };

const fail = (status: 400 | 403 | 404 | 409 | 500, error: string) => ({ ok: false as const, status, error });

export async function logApproval(
  receipt: Pick<Receipt, "id" | "organization_id">,
  actorId: string,
  action: ApprovalAction,
  comment: string | null
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("receipt_approvals")
    .insert({ receipt_id: receipt.id, organization_id: receipt.organization_id, actor_id: actorId, action, comment });
  if (error) {
    // The decision itself is saved; a lost log line is reported, never shown.
    Sentry.captureMessage("approval log insert failed", { level: "warning", tags: { area: "team", code: error.code } });
    console.error("[team] approval log failed", error.code);
  }
}

async function readReceipt(id: string): Promise<Receipt | null | "error"> {
  const { data, error } = await getSupabaseAdmin().from("receipts").select("*").eq("id", id).maybeSingle();
  if (error) return "error";
  return (data as Receipt | null) ?? null;
}

/**
 * The employee sends their receipt for approval: merchant, amount and date
 * must be there; it counts as confirmed (status verified) and toward the
 * company's plan, and the approvers hear about it.
 */
export async function submitReceipt(
  userId: string,
  receiptId: string,
  paidBy: PaidBy
): Promise<TeamResult<{ approvedBy: string | null }>> {
  const receipt = await readReceipt(receiptId);
  if (receipt === "error") return fail(500, "lookup_failed");
  // Someone else's receipt is a miss, so ids can't be probed.
  if (!receipt || receipt.user_id !== userId) return fail(404, "not_found");

  let employment;
  try {
    employment = await getEmployment(userId);
  } catch {
    return fail(500, "lookup_failed");
  }
  if (!employment || employment.organizationId !== receipt.organization_id) return fail(409, "no_approval");

  const complete = missingRequiredFields(receipt).length === 0;
  const next = submitTransition(receipt.approval_status, complete);
  if (!next.ok) return fail(next.reason === "incomplete" ? 400 : 409, next.reason);

  const now = new Date().toISOString();
  const { data: updated, error } = await getSupabaseAdmin()
    .from("receipts")
    .update({
      approval_status: "submitted",
      submitted_at: now,
      decided_at: null,
      decided_by: null,
      paid_by: paidBy,
      // The person checked the fields: confirmed, like the owner's Confirm.
      status: "verified",
    })
    .eq("id", receiptId)
    .eq("user_id", userId)
    .eq("approval_status", receipt.approval_status as string)
    .select("id");
  if (error) return fail(500, "update_failed");
  if (!updated || updated.length === 0) return fail(409, "wrong_state");

  await logApproval(receipt, userId, "submitted", null);
  await recordReceiptUsage({ userId, receiptId, source: usageSource(receipt.source) });

  let approvedBy: string | null = null;
  try {
    const team = await loadTeam(employment.organizationId);
    const me = team.find((m) => m.userId === userId);
    const approvers = me ? approversOf(me, team) : [];
    const people = await peopleById([userId, ...approvers]);
    approvedBy = approvers.length === 1 ? labelOf(people.get(approvers[0])) : null;
    await notifyApprovers({ organizationId: employment.organizationId, approvers, employee: labelOf(people.get(userId)), team });
  } catch (err) {
    console.error("[team] approver notice failed", err instanceof Error ? err.message : "unknown");
  }
  return { ok: true, value: { approvedBy } };
}

/** The approver's answer: approve, send back (with why) or reject (with why). */
export async function decideReceipt(
  actorId: string,
  receiptId: string,
  decision: Decision,
  rawComment: string | null | undefined
): Promise<TeamResult> {
  const receipt = await readReceipt(receiptId);
  if (receipt === "error") return fail(500, "lookup_failed");
  if (!receipt || !receipt.organization_id) return fail(404, "not_found");

  let team: TeamMember[];
  try {
    team = await loadTeam(receipt.organization_id);
  } catch {
    return fail(500, "lookup_failed");
  }
  // Not the caller's to decide: a miss, so ids can't be probed. A draft is
  // still the employee's alone.
  if (!canDecide(actorId, receipt.user_id, team) || receipt.approval_status === "draft") return fail(404, "not_found");

  const comment = cleanComment(rawComment);
  const next = decisionTransition(receipt.approval_status, decision, comment);
  if (!next.ok) return fail(next.reason === "comment_required" ? 400 : 409, next.reason);

  const { data: updated, error } = await getSupabaseAdmin()
    .from("receipts")
    .update({
      approval_status: next.status,
      decided_at: new Date().toISOString(),
      decided_by: actorId,
      approval_comment: comment,
    })
    .eq("id", receiptId)
    .eq("organization_id", receipt.organization_id)
    .eq("approval_status", "submitted")
    // An edit since this read moves updated_at: decide on what was read, or not at all.
    .eq("updated_at", receipt.updated_at)
    .select("id");
  if (error) return fail(500, "update_failed");
  if (!updated || updated.length === 0) return fail(409, "wrong_state");

  await logApproval(receipt, actorId, next.status === "approved" ? "approved" : next.status === "sent_back" ? "sent_back" : "rejected", comment);
  if (next.status === "sent_back" || next.status === "rejected") {
    await notifyDecision({ employeeId: receipt.user_id, decision: next.status, comment, merchant: receipt.merchant_name });
  }
  return { ok: true, value: null };
}

/** The receipts of the caller's company sent to them and not decided yet, oldest first. */
export async function loadApprovalQueue(userId: string): Promise<ApprovalQueueItem[]> {
  const context = await teamContextFor(userId);
  if (!context) return [];
  const team = await loadTeam(context.organizationId);
  const theirs = team.filter((m) => canDecide(userId, m.userId, team)).map((m) => m.userId);
  if (theirs.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("approval_status", "submitted")
    .in("user_id", theirs)
    .order("submitted_at", { ascending: true })
    .limit(200);
  if (error) throw new TeamReadError(`queue read failed (${error.code})`);
  const rows = (data ?? []) as Receipt[];
  const people = await peopleById(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    receipt: toMobileReceipt(r),
    employee: labelOf(people.get(r.user_id)),
    submittedAt: r.submitted_at ?? null,
  }));
}

/** How many receipts wait for `userId`'s decision (home badge). */
export async function countToApprove(organizationId: string, userId: string, team: TeamMember[]): Promise<number> {
  const theirs = team.filter((m) => canDecide(userId, m.userId, team)).map((m) => m.userId);
  if (theirs.length === 0) return 0;
  const { count, error } = await getSupabaseAdmin()
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("approval_status", "submitted")
    .in("user_id", theirs);
  if (error) throw new TeamReadError(`count failed (${error.code})`);
  return count ?? 0;
}

/**
 * The person's place in their company's team for the home screens, or null
 * for someone working alone (an owner without colleagues). Best effort:
 * null on a database failure.
 */
export async function loadHomeTeam(userId: string): Promise<MobileTeam | null> {
  try {
    // Read only (a home load creates nothing): the employer, else the user's own company.
    const employment = await getEmployment(userId);
    const ownId = employment ? null : await getDefaultOrganizationId(userId);
    const context = employment
      ? { organizationId: employment.organizationId, role: employment.role }
      : ownId
        ? { organizationId: ownId, role: "owner" as const }
        : null;
    if (!context) return null;
    const team = await loadTeam(context.organizationId);
    if (team.length <= 1 && !needsApproval(context.role)) return null;
    const me = team.find((m) => m.userId === userId);
    const approvers = me ? approversOf(me, team) : [];
    const [{ data: org }, people, toApprove] = await Promise.all([
      getSupabaseAdmin().from("organizations").select("name").eq("id", context.organizationId).maybeSingle(),
      peopleById(approvers.slice(0, 1)),
      context.role === "member" ? Promise.resolve(0) : countToApprove(context.organizationId, userId, team),
    ]);
    return {
      role: context.role,
      companyName: typeof org?.name === "string" ? org.name : "Your company",
      approvedBy: approvers.length === 1 ? labelOf(people.get(approvers[0])) : approvers.length > 1 ? "the owners" : null,
      toApprove,
    };
  } catch (err) {
    console.error("[team] home team failed", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

/** Approved outlays not paid back yet, per employee. Owners only. */
export async function loadReimbursements(userId: string): Promise<TeamResult<ReimbursementGroup[]>> {
  const context = await teamContextFor(userId);
  if (!context || context.role !== "owner") return fail(403, "owners_only");
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .select("id, user_id, total, currency, home_total, home_currency, approval_status, paid_by, reimbursed_at")
    .eq("organization_id", context.organizationId)
    .eq("approval_status", "approved")
    .eq("paid_by", "employee")
    .is("reimbursed_at", null)
    .limit(2000);
  if (error) return fail(500, "lookup_failed");
  const rows = (data ?? []) as Array<Pick<Receipt, "id" | "user_id" | "total" | "currency" | "home_total" | "home_currency" | "approval_status" | "paid_by" | "reimbursed_at">>;
  const people = await peopleById(rows.map((r) => r.user_id));
  // One group per employee and currency: amounts in different currencies are never added together.
  const groups = new Map<string, ReimbursementGroup>();
  for (const r of rows.filter(owedToEmployee)) {
    const currency = r.home_currency && r.home_total != null ? r.home_currency : r.currency;
    const amount = r.home_currency && r.home_total != null ? r.home_total : r.total ?? 0;
    const key = `${r.user_id}|${currency}`;
    const g = groups.get(key) ?? {
      userId: r.user_id,
      employee: labelOf(people.get(r.user_id)),
      currency,
      total: 0,
      count: 0,
      receiptIds: [],
    };
    g.total = Math.round((g.total + amount) * 100) / 100;
    g.count += 1;
    g.receiptIds.push(r.id);
    groups.set(key, g);
  }
  return { ok: true, value: [...groups.values()].sort((a, b) => a.employee.localeCompare(b.employee)) };
}

/** Marks approved outlays as paid back. Owners only; only this company's owed receipts move. */
export async function markReimbursed(userId: string, receiptIds: string[]): Promise<TeamResult<{ count: number }>> {
  const context = await teamContextFor(userId);
  if (!context || context.role !== "owner") return fail(403, "owners_only");
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .update({ reimbursed_at: new Date().toISOString(), reimbursed_by: userId })
    .in("id", receiptIds)
    .eq("organization_id", context.organizationId)
    .eq("approval_status", "approved")
    .eq("paid_by", "employee")
    .is("reimbursed_at", null)
    .select("id, organization_id");
  if (error) return fail(500, "update_failed");
  const moved = (data ?? []) as Array<Pick<Receipt, "id" | "organization_id">>;
  for (const r of moved) await logApproval(r, userId, "reimbursed", null);
  return { ok: true, value: { count: moved.length } };
}
