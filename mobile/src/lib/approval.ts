// An employee's receipt in the app (2026-11-15): what the receipt screen and
// the list show about its approval. Pure, so it is tested. The rules
// themselves are the server's (src/lib/team/rules.ts); the app only decides
// what to show, and the server refuses anything else.

import type { MobileReceipt } from "@/lib/mobile/types";

export type ApprovalBand = "notSent" | "submitted" | "approved" | "approvedOwed" | "approvedPaid" | "sentBack" | "rejected";

export type ApprovalView = {
  /** The line on top of the receipt, or null when no approval applies. */
  band: ApprovalBand | null;
  /** The approver's words (sent back / rejected). */
  comment: string | null;
  /** "Send for approval" is the main button (also for a filled-in receipt not confirmed yet). */
  canSend: boolean;
  mayEdit: boolean;
  mayDelete: boolean;
  /** Needs the employee: a honey band. */
  attention: boolean;
};

export function approvalView(r: Pick<MobileReceipt, "approval" | "missing">): ApprovalView {
  const a = r.approval;
  if (!a) return { band: null, comment: null, canSend: false, mayEdit: true, mayDelete: true, attention: false };
  const open = a.status === "draft" || a.status === "sent_back";
  const band: ApprovalBand =
    a.status === "draft"
      ? "notSent"
      : a.status === "submitted"
        ? "submitted"
        : a.status === "sent_back"
          ? "sentBack"
          : a.status === "rejected"
            ? "rejected"
            : a.paidBy === "employee"
              ? a.reimbursed
                ? "approvedPaid"
                : "approvedOwed"
              : "approved";
  return {
    band,
    comment: a.status === "sent_back" || a.status === "rejected" ? a.comment : null,
    canSend: open && r.missing.length === 0,
    mayEdit: a.status !== "rejected",
    mayDelete: a.status !== "submitted" && a.status !== "approved",
    attention: open,
  };
}

/** The short word on a list row, or null. */
export type ApprovalRowLabel = "toSend" | "sent" | "approved" | "sentBack" | "rejected";

export function approvalRowLabel(r: Pick<MobileReceipt, "approval">): ApprovalRowLabel | null {
  switch (r.approval?.status) {
    case "draft":
      return "toSend";
    case "submitted":
      return "sent";
    case "approved":
      return "approved";
    case "sent_back":
      return "sentBack";
    case "rejected":
      return "rejected";
    default:
      return null;
  }
}
