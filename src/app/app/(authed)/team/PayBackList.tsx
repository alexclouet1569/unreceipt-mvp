"use client";

// Approved outlays still owed, per employee and currency (owners). Mark
// paid once the money went out, e.g. with the salary
// (POST /api/team/reimbursements).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/receipt-format";
import type { ReimbursementGroup } from "@/lib/mobile/types";

export function PayBackList({ groups }: { groups: ReimbursementGroup[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px" }}>
        Nothing to pay back. Approved receipts paid with an employee&apos;s own money show up here.
      </p>
    );
  }

  const markPaid = async (g: ReimbursementGroup) => {
    const key = `${g.userId}|${g.currency}`;
    if (busy) return;
    if (!window.confirm(`Mark ${formatAmount(g.total, g.currency)} as paid back to ${g.employee}? This can't be undone.`)) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/team/reimbursements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receiptIds: g.receiptIds }),
      });
      if (res.ok) router.refresh();
      else setError("Couldn't save. Try again.");
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    }
    setBusy(null);
  };

  return (
    <div className="space-y-2">
      <ul
        role="list"
        className="bg-card divide-y divide-[var(--hairline)]"
        style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
      >
        {groups.map((g) => {
          const key = `${g.userId}|${g.currency}`;
          return (
            <li key={key} className="flex items-center justify-between gap-3" style={{ padding: "12px 14px" }}>
              <span className="min-w-0">
                <span className="block text-[var(--ink)] [overflow-wrap:anywhere]" style={{ fontSize: "15px", fontWeight: 600 }}>
                  {g.employee}
                </span>
                <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                  {g.count === 1 ? "1 receipt" : `${g.count} receipts`}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium tabular-nums whitespace-nowrap text-[var(--ink)]">
                  {formatAmount(g.total, g.currency)}
                </span>
                <Button type="button" variant="outline" className="h-11" disabled={busy !== null} onClick={() => markPaid(g)}>
                  {busy === key ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                  Mark paid
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
