"use client";

// An employee's receipt in the receipt sheet (2026-11-15, src/lib/team/):
// where it is in the approval (sent back or rejected with the approver's
// words), and, once checked, "Send for approval" with whose money paid it.
// POST /api/receipts/<id>/submit; the server checks everything again.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaidBy, Receipt } from "@/lib/types";
import { missingRequiredFields } from "@/lib/receipts/status";

export function canSendForApproval(receipt: Receipt): boolean {
  // As the iPhone app: filled in is enough; sending confirms it.
  return (
    (receipt.approval_status === "draft" || receipt.approval_status === "sent_back") &&
    missingRequiredFields(receipt).length === 0
  );
}

const STATUS_LINE: Record<string, string> = {
  draft: "Not sent yet. Check it, then send it for approval.",
  submitted: "Sent for approval. You'll see the answer here.",
  approved: "Approved.",
  sent_back: "Sent back to you. Fix what's asked, then send it again.",
  rejected: "Rejected. It won't be paid back or booked.",
};

export function ApprovalPanel({ receipt }: { receipt: Receipt }) {
  const router = useRouter();
  const [paidBy, setPaidBy] = useState<PaidBy>(receipt.paid_by ?? "employee");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = receipt.approval_status;
  if (!status) return null;
  const sendable = canSendForApproval(receipt);
  const attention = status === "draft" || status === "sent_back";
  const rejected = status === "rejected";

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paidBy }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === "incomplete"
            ? "Add the merchant, amount and date first."
            : body.error === "rate_limited"
              ? "Many receipts in a short time. Try again in a moment."
              : res.status === 409
                ? "This receipt changed meanwhile. Close it and open it again."
                : "Couldn't send. Try again."
        );
      }
    } catch {
      setError("Couldn't send. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div
      className="rounded-[12px] px-4 py-3 space-y-3"
      style={{
        border: "1px solid var(--hairline)",
        ...(attention ? { borderLeft: "3px solid var(--attention)" } : {}),
        background: "var(--card)",
      }}
      data-testid="approval-panel"
    >
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)]">Approval</p>
        <p
          className={
            rejected
              ? "text-[var(--negative)] font-semibold"
              : attention
                ? "text-[var(--attention-deep)] font-semibold"
                : "text-[var(--ink)] font-semibold"
          }
          style={{ fontSize: "15px" }}
        >
          {STATUS_LINE[status]}
          {status === "approved" && receipt.paid_by === "employee"
            ? receipt.reimbursed_at
              ? " Paid back to you."
              : " To be paid back to you."
            : ""}
        </p>
        {(status === "sent_back" || rejected) && receipt.approval_comment ? (
          <p className="text-[var(--ink)]" style={{ fontSize: "14px" }}>
            “{receipt.approval_comment}”
          </p>
        ) : null}
      </div>

      {sendable ? (
        <>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-semibold text-[var(--ink-muted)] mb-1">Who paid?</legend>
            {(
              [
                ["employee", "I paid with my own money (pay me back)"],
                ["company", "I paid with the company's card or account"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 min-h-11 text-[15px] text-[var(--ink)]">
                <input
                  type="radio"
                  name={`paid-by-${receipt.id}`}
                  value={value}
                  checked={paidBy === value}
                  onChange={() => setPaidBy(value)}
                  className="size-4 accent-[var(--brand-action)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Button type="button" className="w-full h-11 gap-1.5" onClick={send} disabled={busy} data-testid="send-for-approval">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
            Send for approval
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
