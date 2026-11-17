import { describe, expect, it } from "vitest";
import {
  approversOf,
  canDecide,
  cleanComment,
  decisionTransition,
  needsApproval,
  owedToEmployee,
  ownerMayDelete,
  ownerMayEdit,
  lockedAfterPayback,
  statusAfterEdit,
  touchesApproved,
  submitTransition,
  type TeamMember,
} from "../rules";

const owner: TeamMember = { userId: "boss", role: "owner", approverId: null };
const lead: TeamMember = { userId: "lead", role: "approver", approverId: null };
const anna: TeamMember = { userId: "anna", role: "member", approverId: "lead" };
const erik: TeamMember = { userId: "erik", role: "member", approverId: null };
const team = [owner, lead, anna, erik];

describe("who approves", () => {
  it("an owner's receipts need no approval, a sole owner's either", () => {
    expect(needsApproval("owner")).toBe(false);
    expect(approversOf(owner, [owner])).toEqual([]);
  });

  it("an employee's go to their approver, else to the owners", () => {
    expect(approversOf(anna, team)).toEqual(["lead"]);
    expect(approversOf(erik, team)).toEqual(["boss"]);
    // The approver's own receipts go to the owner.
    expect(approversOf(lead, team)).toEqual(["boss"]);
  });

  it("falls back to the owners when the assigned approver left or is no longer one", () => {
    expect(approversOf(anna, [owner, anna])).toEqual(["boss"]);
    expect(approversOf(anna, [owner, { ...lead, role: "member" }, anna])).toEqual(["boss"]);
  });

  it("nobody decides on their own receipt; owners decide on anyone's; approvers only on theirs", () => {
    expect(canDecide("anna", "anna", team)).toBe(false);
    expect(canDecide("lead", "anna", team)).toBe(true);
    expect(canDecide("lead", "erik", team)).toBe(false);
    expect(canDecide("boss", "anna", team)).toBe(true);
    expect(canDecide("boss", "lead", team)).toBe(true);
    expect(canDecide("anna", "erik", team)).toBe(false);
    // An owner's receipt has no approval to decide on.
    expect(canDecide("lead", "boss", team)).toBe(false);
    // Someone outside the company.
    expect(canDecide("stranger", "anna", team)).toBe(false);
  });
});

describe("what happens", () => {
  it("sends a complete draft or a sent-back receipt", () => {
    expect(submitTransition("draft", true)).toEqual({ ok: true, status: "submitted" });
    expect(submitTransition("sent_back", true)).toEqual({ ok: true, status: "submitted" });
    expect(submitTransition("draft", false)).toEqual({ ok: false, reason: "incomplete" });
    expect(submitTransition("approved", true)).toEqual({ ok: false, reason: "wrong_state" });
    expect(submitTransition(null, true)).toEqual({ ok: false, reason: "wrong_state" });
  });

  it("decides only on a submitted receipt, and says why when it isn't an approval", () => {
    expect(decisionTransition("submitted", "approve", null)).toEqual({ ok: true, status: "approved" });
    expect(decisionTransition("submitted", "send_back", "Add the guests' names")).toEqual({ ok: true, status: "sent_back" });
    expect(decisionTransition("submitted", "reject", "  ")).toEqual({ ok: false, reason: "comment_required" });
    expect(decisionTransition("submitted", "reject", "Private purchase")).toEqual({ ok: true, status: "rejected" });
    expect(decisionTransition("draft", "approve", null)).toEqual({ ok: false, reason: "wrong_state" });
  });

  it("asks again when what was approved changes", () => {
    expect(statusAfterEdit("approved", ["total"])).toBe("submitted");
    expect(statusAfterEdit("approved", ["paid_by"])).toBe("submitted");
    // What is paid back is the amount in the company's currency (security review).
    expect(statusAfterEdit("approved", ["home_total"])).toBe("submitted");
    expect(statusAfterEdit("approved", ["vat_lines"])).toBe("submitted");
    expect(statusAfterEdit("approved", ["notes", "category"])).toBeNull();
    expect(statusAfterEdit("submitted", ["total"])).toBeNull();
  });

  it("knows which changed columns were approved", () => {
    expect(touchesApproved(["total", "status"])).toBe(true);
    expect(touchesApproved(["home_currency"])).toBe(true);
    expect(touchesApproved(["notes", "category", "status", "edited_at"])).toBe(false);
    expect(touchesApproved([])).toBe(false);
  });

  it("fixes what was approved once the outlay is paid back (founder decision 2026-11-17)", () => {
    const paid = { approval_status: "approved" as const, reimbursed_at: "2026-11-10T09:00:00+00:00" };
    expect(lockedAfterPayback(paid, ["total"])).toBe(true);
    expect(lockedAfterPayback(paid, ["home_total", "home_currency"])).toBe(true);
    expect(lockedAfterPayback(paid, ["vat_lines"])).toBe(true);
    // Notes and category stay editable.
    expect(lockedAfterPayback(paid, ["notes", "category"])).toBe(false);
    // Not paid back yet: the edit reopens approval instead.
    expect(lockedAfterPayback({ approval_status: "approved", reimbursed_at: null }, ["total"])).toBe(false);
    expect(lockedAfterPayback({ approval_status: "approved" }, ["total"])).toBe(false);
    expect(lockedAfterPayback({ approval_status: "submitted", reimbursed_at: paid.reimbursed_at }, ["total"])).toBe(false);
    expect(lockedAfterPayback({ approval_status: null, reimbursed_at: null }, ["total"])).toBe(false);
  });

  it("a rejection stands; a pending or approved receipt can't be deleted by its owner", () => {
    expect(ownerMayEdit("rejected")).toBe(false);
    expect(ownerMayEdit("sent_back")).toBe(true);
    expect(ownerMayDelete("submitted")).toBe(false);
    expect(ownerMayDelete("approved")).toBe(false);
    expect(ownerMayDelete("draft")).toBe(true);
    expect(ownerMayDelete("rejected")).toBe(true);
    expect(ownerMayDelete(null)).toBe(true);
  });

  it("owes the employee only an approved outlay not yet paid back", () => {
    expect(owedToEmployee({ approval_status: "approved", paid_by: "employee", reimbursed_at: null })).toBe(true);
    expect(owedToEmployee({ approval_status: "approved", paid_by: "company" })).toBe(false);
    expect(owedToEmployee({ approval_status: "submitted", paid_by: "employee" })).toBe(false);
    expect(owedToEmployee({ approval_status: "approved", paid_by: "employee", reimbursed_at: "2026-11-30" })).toBe(false);
  });

  it("keeps a comment short and on one line", () => {
    expect(cleanComment("  Add\n the   guests  ")).toBe("Add the guests");
    expect(cleanComment("   ")).toBeNull();
    expect(cleanComment("x".repeat(2000))?.length).toBe(1000);
  });
});
