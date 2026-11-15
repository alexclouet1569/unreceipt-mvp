"use client";

// Receipts waiting for the signed-in person's decision (GET /api/team/approvals
// rendered by the page). Each row: the employee, merchant, amount, date,
// who paid, the original one tap away; Approve, or Send back / Reject with
// a reason (POST /api/receipts/<id>/decision). A decided row leaves the list.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Undo2, X } from "lucide-react";
import { OriginalSourceViewer } from "@/components/receipt/OriginalSourceViewer";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/receipt-format";
import type { ApprovalQueueItem } from "@/lib/mobile/types";

type Asking = { id: string; decision: "send_back" | "reject" } | null;

function day(d: string | null): string {
  if (!d) return "No date";
  return new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ApprovalList({ items }: { items: ApprovalQueueItem[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [comment, setComment] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  // Said to screen readers when a card leaves the list.
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const shown = items.filter((i) => !done.has(i.receipt.id));

  const decide = async (id: string, decision: "approve" | "send_back" | "reject", why?: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comment: why ?? null }),
      });
      if (res.ok || res.status === 409) {
        // 409: someone else decided first. Either way it is no longer waiting.
        setDone((s) => new Set(s).add(id));
        setAsking(null);
        setComment("");
        setAnnounce(
          res.status === 409
            ? "Someone else already decided on this receipt."
            : decision === "approve"
              ? "Approved."
              : decision === "send_back"
                ? "Sent back."
                : "Rejected."
        );
        // Focus moves to the list's heading, not the body.
        document.getElementById("approve-heading")?.focus();
        router.refresh();
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError({
          id,
          text: body.error === "comment_required" ? "Write why, so they know what to do." : "Couldn't save. Try again.",
        });
      }
    } catch {
      setError({ id, text: "Couldn't save. Check your connection and try again." });
    }
    setBusy(null);
  };

  const status = (
    <p role="status" className="sr-only">
      {announce}
    </p>
  );

  if (shown.length === 0) {
    return (
      <>
        {status}
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px" }}>
          Nothing waits for you. Receipts your colleagues send for approval show up here.
        </p>
      </>
    );
  }

  return (
    <>
    {status}
    <ul role="list" className="space-y-2">
      {shown.map(({ receipt: r, employee }) => (
        <li
          key={r.id}
          className="bg-card space-y-3"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", fontWeight: 600 }}>
                {employee}
              </p>
              <p className="text-[var(--ink)] [overflow-wrap:anywhere]" style={{ fontSize: "15px", fontWeight: 700 }}>
                {r.merchant ?? "Unknown merchant"}
              </p>
              <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                {day(r.date)} · {r.approval?.paidBy === "company" ? "Paid by the company" : "To pay back"}
                {r.notes ? ` · ${r.notes}` : ""}
              </p>
            </div>
            <p className="font-mono text-sm font-medium tabular-nums whitespace-nowrap text-[var(--ink)]">
              {formatAmount(r.total, r.currency)}
            </p>
          </div>

          {asking?.id === r.id ? (
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-[var(--ink-muted)]" htmlFor={`why-${r.id}`}>
                {asking.decision === "send_back" ? "What should they fix?" : "Why is it rejected?"}
              </label>
              <textarea
                id={`why-${r.id}`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                rows={2}
                className="w-full rounded-[10px] border border-[var(--hairline)] bg-card px-3 py-2 text-[16px] text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setAsking(null);
                    setComment("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={asking.decision === "reject" ? "outline" : "default"}
                  className={asking.decision === "reject" ? "h-11 gap-1.5 text-destructive hover:text-destructive" : "h-11 gap-1.5"}
                  disabled={busy !== null || comment.trim().length === 0}
                  onClick={() => decide(r.id, asking.decision, comment)}
                >
                  {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                  {asking.decision === "send_back" ? "Send back" : "Reject"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-11 gap-1.5" disabled={busy !== null} onClick={() => decide(r.id, "approve")}>
                {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-1.5"
                onClick={() => {
                  setAsking({ id: r.id, decision: "send_back" });
                  setComment("");
                }}
              >
                <Undo2 className="w-4 h-4" aria-hidden="true" />
                Send back
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  setAsking({ id: r.id, decision: "reject" });
                  setComment("");
                }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
                Reject
              </Button>
              {r.original ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 gap-1.5"
                  aria-expanded={viewing === r.id}
                  onClick={() => setViewing((v) => (v === r.id ? null : r.id))}
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  {viewing === r.id ? "Hide original" : "Original"}
                </Button>
              ) : null}
            </div>
          )}
          {viewing === r.id ? (
            <div className="overflow-hidden rounded-[10px] border border-[var(--hairline)]">
              <OriginalSourceViewer receiptId={r.id} />
            </div>
          ) : null}
          {error?.id === r.id ? (
            <p role="alert" className="text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2">
              {error.text}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
    </>
  );
}
