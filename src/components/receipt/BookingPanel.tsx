"use client";

// The booking agent in the receipt sheet (src/lib/accounting/): the voucher
// it proposes for this receipt (expense account, input VAT, payment
// account), why, and "Approve and book in Fortnox". Once posted, the
// voucher number. Renders nothing when Fortnox isn't set up for the
// company (or in the demo tours, whose fetch answers 404): connecting lives
// in Settings and on the firm's client page.
//
// GET/POST /api/receipts/<id>/booking; the server decides who may approve
// and checks everything again when approving.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOCK_MESSAGES, NOTE_MESSAGES, SOURCE_LABEL, errorMessage } from "@/lib/accounting/messages";
import type { BookingBlock, BookingNote } from "@/lib/accounting/types";
import { formatAmount } from "@/lib/receipt-format";

type ProposalView = {
  id: string;
  status: "proposed" | "approved" | "posting" | "posted" | "unknown" | "failed";
  updatedAt: string;
  transactionDate: string;
  series: string;
  rows: Array<{ account: string; name: string; debit: number; credit: number }>;
  totalSek: number;
  source: string;
  confidence: number | null;
  notes: BookingNote[];
  reason: string | null;
  debitAccount: string | null;
  errorCode: string | null;
  voucherRef: string | null;
};

type View =
  | { kind: "not_configured" }
  | { kind: "not_connected" }
  | { kind: "unavailable" }
  | { kind: "waiting" }
  | { kind: "needs_reconnect"; canConnect: boolean }
  | { kind: "blocked"; blocks: BookingBlock[]; canApprove: boolean }
  | { kind: "proposal"; proposal: ProposalView; canApprove: boolean; accounts: Array<{ number: string; name: string }> };

const STATUS_LINE: Record<ProposalView["status"], string> = {
  proposed: "Proposed voucher",
  failed: "Not booked",
  approved: "Approved, booking in Fortnox…",
  posting: "Booking in Fortnox…",
  unknown: "Checking with Fortnox whether it was booked…",
  posted: "Booked in Fortnox",
};

export type BookingPanelState = "approvable" | "in_fortnox" | "other";

/** 16px on phones (iOS zooms into smaller fields), the focus ring of the other fields. */
export const FIELD_CLASS =
  "w-full h-11 rounded-[10px] border border-[var(--hairline)] bg-card px-3 text-base md:text-sm text-[var(--ink)] outline-none focus-visible:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50";

function Panel({ attention, children }: { attention?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px] px-4 py-3 space-y-3"
      style={{
        border: "1px solid var(--hairline)",
        ...(attention ? { borderLeft: "3px solid var(--attention)" } : {}),
        background: "var(--card)",
      }}
      data-testid="booking-panel"
    >
      <p className="type-micro uppercase tracking-[0.06em] text-[var(--ink-muted)]">Fortnox</p>
      {children}
    </div>
  );
}

export function BookingPanel({
  receiptId,
  viewer = "owner",
  onStateChange,
}: {
  receiptId: string;
  viewer?: "owner" | "firm";
  /**
   * "approvable": the panel offers Approve (the sheet's one green, so the
   * sheet's own primary turns outline); "in_fortnox": approved or booked
   * (the sheet hides its manual "Mark as booked"); "other": anything else.
   */
  onStateChange?: (state: BookingPanelState) => void;
}) {
  const router = useRouter();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [account, setAccount] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mounted with key={receipt.id}: a new receipt is a fresh panel.
    let alive = true;
    fetch(`/api/receipts/${encodeURIComponent(receiptId)}/booking`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as View) : null))
      .catch(() => null)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setLoaded(true);
        if (v?.kind === "proposal") setAccount(v.proposal.debitAccount ?? "");
      });
    return () => {
      alive = false;
    };
  }, [receiptId]);

  const panelState: BookingPanelState =
    view?.kind !== "proposal"
      ? "other"
      : view.proposal.status === "proposed" || view.proposal.status === "failed"
        ? view.canApprove
          ? "approvable"
          : "other"
        : "in_fortnox";
  useEffect(() => {
    onStateChange?.(panelState);
  }, [panelState, onStateChange]);

  // A placeholder of the panel's height while it loads, so the sheet's
  // buttons don't jump under the finger when it appears.
  if (!loaded) {
    return (
      <div className="rounded-[12px] px-4 py-3 space-y-2" style={{ border: "1px solid var(--hairline)" }} aria-hidden="true">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-16 w-full rounded" />
      </div>
    );
  }
  if (!view || view.kind === "not_configured" || view.kind === "not_connected" || view.kind === "waiting") return null;

  if (view.kind === "unavailable") {
    return (
      <Panel>
        <p className="type-body text-[var(--ink-muted)]">Fortnox can&apos;t be reached right now. Try again later.</p>
      </Panel>
    );
  }
  if (view.kind === "needs_reconnect") {
    return (
      <Panel attention>
        <p className="text-[15px] font-semibold text-[var(--attention-deep)]">The Fortnox connection needs to be renewed.</p>
        {view.canConnect ? (
          <p className="type-body text-[var(--ink)]">
            {viewer === "firm" ? "Reconnect it in the Fortnox card on this client's page." : "Reconnect it in Settings → Fortnox."}
          </p>
        ) : null}
      </Panel>
    );
  }
  if (view.kind === "blocked") {
    if (!view.canApprove) return null;
    return (
      <Panel attention>
        <p className="text-[15px] font-semibold text-[var(--attention-deep)]">Not ready to book in Fortnox</p>
        <ul className="list-disc pl-5 space-y-1 type-body text-[var(--ink)]">
          {view.blocks.map((b) => (
            <li key={b}>{BLOCK_MESSAGES[b] ?? b}</li>
          ))}
        </ul>
      </Panel>
    );
  }

  const p = view.proposal;
  const approvable = view.canApprove && (p.status === "proposed" || p.status === "failed");
  const failure = p.status === "failed" ? errorMessage(p.errorCode) : null;
  const attachNote = p.status === "posted" && p.errorCode === "file_not_attached" ? errorMessage(p.errorCode) : null;
  const shownRows = p.rows.map((r) =>
    approvable && r.debit > 0 && r.account === p.debitAccount && account && account !== p.debitAccount
      ? { ...r, account, name: view.accounts.find((a) => a.number === account)?.name ?? "" }
      : r,
  );

  const approve = async () => {
    if (busy || !account) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}/booking`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, expectedUpdatedAt: p.updatedAt }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        proposal?: ProposalView;
        error?: string;
        blocks?: BookingBlock[];
      };
      if (res.ok && body.proposal) {
        setView({ ...view, proposal: body.proposal, canApprove: false });
        router.refresh();
        // The button is gone: put focus on the outcome, which is announced.
        requestAnimationFrame(() => statusRef.current?.focus());
      } else if (body.error === "blocked" && body.blocks?.length) {
        setError(body.blocks.map((b) => BLOCK_MESSAGES[b] ?? b).join(" "));
      } else {
        setError(
          body.error === "changed"
            ? "This receipt changed meanwhile. Close it and open it again."
            : body.error === "needs_reconnect" || body.error === "not_connected"
              ? "The Fortnox connection needs to be renewed in Settings."
              : body.error === "rate_limited"
                ? "Many bookings in a short time. Try again in a moment."
                : "Couldn't book. Nothing was booked. Try again.",
        );
      }
    } catch {
      setError("Couldn't reach UnReceipt. Check your connection: if the voucher was created, it will show here.");
    }
    setBusy(false);
  };

  return (
    <Panel attention={p.status === "failed" || p.status === "unknown"}>
      <div className="space-y-1">
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className={
            p.status === "failed"
              ? "text-[15px] font-semibold text-[var(--attention-deep)] outline-none"
              : "text-[15px] font-semibold text-[var(--ink)] outline-none"
          }
        >
          {STATUS_LINE[p.status]}
          {p.status === "posted" && p.voucherRef ? ` · ${p.voucherRef}` : ""}
        </p>
        {failure ? <p className="type-body text-[var(--ink)]">{failure}</p> : null}
        {attachNote ? <p className="type-body text-[var(--ink-muted)]">{attachNote}</p> : null}
        <p className="type-caption text-[var(--ink-muted)]">
          {p.transactionDate} · series {p.series}
          {p.status === "proposed" || p.status === "failed" ? ` · ${SOURCE_LABEL[p.source] ?? ""}` : ""}
          {p.reason ? `: ${p.reason}` : ""}
        </p>
      </div>

      <table className="w-full type-body" data-testid="booking-rows">
        <thead>
          <tr className="type-caption text-[var(--ink-muted)]">
            <th className="text-left font-semibold py-1">Account</th>
            <th className="text-right font-semibold py-1">Debit</th>
            <th className="text-right font-semibold py-1">Credit</th>
          </tr>
        </thead>
        <tbody>
          {shownRows.map((r, i) => (
            <tr key={`${r.account}-${i}`} className="border-t border-[var(--hairline)]">
              <td className="py-1.5 pr-2 text-[var(--ink)]">
                <span className="tabular-nums">{r.account}</span>
                {r.name ? <span className="text-[var(--ink-muted)]"> {r.name}</span> : null}
              </td>
              <td className="py-1.5 text-right type-amount-row tabular-nums whitespace-nowrap">
                {r.debit > 0 ? formatAmount(r.debit, "SEK") : ""}
              </td>
              <td className="py-1.5 text-right type-amount-row tabular-nums whitespace-nowrap">
                {r.credit > 0 ? formatAmount(r.credit, "SEK") : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {p.notes.length > 0 ? (
        <ul className="space-y-1 type-caption text-[var(--ink-muted)]">
          {p.notes.map((n) => (
            <li key={n}>{NOTE_MESSAGES[n] ?? n}</li>
          ))}
        </ul>
      ) : null}

      {approvable ? (
        <>
          {view.accounts.length > 0 ? (
            <label className="block space-y-1">
              <span className="block type-caption font-semibold text-[var(--ink-muted)]">Expense account</span>
              <select
                className={FIELD_CLASS}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                data-testid="booking-account"
              >
                {view.accounts.map((a) => (
                  <option key={a.number} value={a.number}>
                    {a.number} {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="button" className="w-full h-11 gap-1.5" onClick={approve} disabled={busy || !account} data-testid="booking-approve">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <BookCheck className="w-4 h-4" aria-hidden="true" />}
            {busy ? "Booking…" : "Approve and book in Fortnox"}
          </Button>
          <p className="type-caption text-[var(--ink-muted)]">
            A voucher in Fortnox can&apos;t be deleted, only reversed. Check the accounts before approving.
          </p>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
