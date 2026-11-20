"use client";

// Firm portal: a client's confirmed receipts not booked yet, each with the
// voucher the agent proposes, to approve several at once. Loaded on demand
// ("Show vouchers to book"): building proposals reads the client's Fortnox
// and may ask the model, so it never runs on a plain page view.
//
// GET/POST /api/firm/clients/<orgId>/booking; posting happens on the server
// after the answer, and "Refresh" shows the result.

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/receipt/BookingPanel";
import { BLOCK_MESSAGES, errorMessage } from "@/lib/accounting/messages";
import type { BookingBlock } from "@/lib/accounting/types";
import { formatAmount } from "@/lib/receipt-format";

type Proposal = {
  status: "proposed" | "approved" | "posting" | "posted" | "unknown" | "failed";
  updatedAt: string;
  totalSek: number;
  debitAccount: string | null;
  errorCode: string | null;
  voucherRef: string | null;
  source: string;
};
type Item = {
  receiptId: string;
  merchant: string | null;
  paidBy: "employee" | "company" | null;
  total: number | null;
  currency: string;
  state:
    | { kind: "proposal"; proposal: Proposal; canApprove?: boolean }
    | { kind: "blocked"; blocks: BookingBlock[] }
    | { kind: string }
    | null;
};
type Batch = { connection: string; items: Item[]; accounts?: Array<{ number: string; name: string }>; more?: boolean };

const STATE_TEXT: Record<Proposal["status"], string> = {
  proposed: "Ready",
  failed: "Not booked",
  approved: "Booking…",
  posting: "Booking…",
  unknown: "Checking with Fortnox…",
  posted: "Booked",
};

export function FortnoxBatch({ organizationId }: { organizationId: string }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // The account each ready voucher will be booked on (the agent's, unless changed).
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  // For the chosen receipts that don't say who paid: one answer for them all.
  const [paidBy, setPaidBy] = useState<"employee" | "company" | null>(null);
  const base = `/api/firm/clients/${encodeURIComponent(organizationId)}/booking`;

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) {
        setMessage({ ok: false, text: res.status === 429 ? "Many requests in a short time. Try again in a moment." : "Couldn't read the vouchers. Try again." });
      } else {
        const body = (await res.json()) as Batch;
        setBatch(body);
        const next: Record<string, string> = {};
        for (const item of body.items) {
          if (item.state?.kind === "proposal") {
            const p = (item.state as { proposal: Proposal }).proposal;
            if ((p.status === "proposed" || p.status === "failed") && p.debitAccount) next[item.receiptId] = p.debitAccount;
          }
        }
        setSelected({});
        setAccounts(next);
      }
    } catch {
      setMessage({ ok: false, text: "Couldn't reach UnReceipt. Check your connection." });
    }
    setLoading(false);
  };

  const approve = async () => {
    if (!batch) return;
    const items = batch.items
      .filter((i) => selected[i.receiptId] && i.state?.kind === "proposal")
      .map((i) => ({
        receiptId: i.receiptId,
        account: accounts[i.receiptId],
        expectedUpdatedAt: (i.state as { proposal: Proposal }).proposal.updatedAt,
        ...(i.paidBy ? {} : paidBy ? { paidBy } : {}),
      }))
      .filter((i) => /^\d{4}$/.test(i.account ?? ""));
    if (items.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = (await res.json().catch(() => ({}))) as { approved?: string[]; refused?: Array<{ error: string }> };
      if (!res.ok) {
        setMessage({ ok: false, text: "Couldn't approve. Nothing was booked. Try again." });
      } else {
        const n = body.approved?.length ?? 0;
        const refused = body.refused?.length ?? 0;
        // Approved rows show "Booking…" at once, so nobody approves them twice.
        const approvedIds = new Set(body.approved ?? []);
        setBatch((b) =>
          b
            ? {
                ...b,
                items: b.items.map((item) =>
                  approvedIds.has(item.receiptId) && item.state?.kind === "proposal"
                    ? {
                        ...item,
                        state: {
                          ...item.state,
                          proposal: { ...(item.state as { proposal: Proposal }).proposal, status: "approved" as const },
                        },
                      }
                    : item,
                ),
              }
            : b,
        );
        setMessage({
          ok: refused === 0,
          text: `${n} voucher${n === 1 ? "" : "s"} approved and being booked in Fortnox.${refused ? ` ${refused} couldn't be approved: open them in the receipts below to see why.` : ""} Refresh in a moment to see the voucher numbers.`,
        });
        setSelected({});
      }
    } catch {
      setMessage({ ok: false, text: "Couldn't reach UnReceipt. Refresh to see what was booked." });
    }
    setBusy(false);
  };

  const chosenIds = Object.keys(selected).filter((id) => selected[id]);
  const chosen = chosenIds.length;
  const unknownPayer = (batch?.items ?? []).some((i) => selected[i.receiptId] && !i.paidBy);

  return (
    <section
      className="bg-card space-y-3"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}
      data-testid="fortnox-batch"
      aria-labelledby={`fortnox-batch-${organizationId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`fortnox-batch-${organizationId}`} className="font-display font-bold text-[var(--ink)] text-base">
          Book in Fortnox
        </h2>
        {batch ? (
          <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
            Refresh
          </Button>
        ) : null}
      </div>

      {!batch ? (
        <Button type="button" variant="outline" className="w-full h-11" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
          {loading ? "Preparing vouchers…" : "Show vouchers to book"}
        </Button>
      ) : batch.connection !== "active" ? (
        <p className="type-body text-[var(--ink-muted)]">Fortnox isn&apos;t connected for this client, or can&apos;t be reached right now.</p>
      ) : batch.items.length === 0 ? (
        <p className="type-body text-[var(--ink-muted)]">Nothing to book: every confirmed receipt is booked.</p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--hairline)]">
            {batch.items.map((item) => {
              const state = item.state;
              const proposal = state?.kind === "proposal" ? (state as { proposal: Proposal }).proposal : null;
              const blocks = state?.kind === "blocked" ? (state as { blocks: BookingBlock[] }).blocks : null;
              const ready = proposal && (proposal.status === "proposed" || proposal.status === "failed");
              const id = `batch-${item.receiptId}`;
              return (
                <li key={item.receiptId} className="py-2 space-y-1">
                  {(() => {
                    const text = (
                      <>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate type-body text-[var(--ink)]">{item.merchant ?? "Receipt"}</span>
                          <span className="block type-caption text-[var(--ink-muted)]">
                            {proposal
                              ? `${STATE_TEXT[proposal.status]}${proposal.voucherRef ? ` · ${proposal.voucherRef}` : ""}${
                                  proposal.status === "failed" ? ` · ${errorMessage(proposal.errorCode)}` : ""
                                }`
                              : blocks
                                ? blocks.map((b) => BLOCK_MESSAGES[b] ?? b).join(" ")
                                : "Open it in the receipts below to see why it can't be booked yet."}
                          </span>
                        </span>
                        <span className="type-amount-row tabular-nums text-[var(--ink)] whitespace-nowrap">
                          {proposal ? formatAmount(proposal.totalSek, "SEK") : formatAmount(item.total, item.currency)}
                        </span>
                      </>
                    );
                    // The whole row is the tap target when it can be chosen.
                    return ready ? (
                      <label htmlFor={id} className="flex items-center gap-3 min-h-11 cursor-pointer">
                        <input
                          id={id}
                          type="checkbox"
                          className="size-5 accent-[var(--ink)]"
                          checked={Boolean(selected[item.receiptId])}
                          onChange={(e) => setSelected((s) => ({ ...s, [item.receiptId]: e.target.checked ? "1" : "" }))}
                        />
                        {text}
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 min-h-11">
                        <span className="size-5 shrink-0" aria-hidden="true" />
                        {text}
                      </div>
                    );
                  })()}
                  {ready && batch.accounts && batch.accounts.length > 0 ? (
                    <select
                      aria-label={`Expense account for ${item.merchant ?? "this receipt"}`}
                      className={`ml-8 !w-[calc(100%-2rem)] ${FIELD_CLASS}`}
                      value={accounts[item.receiptId] ?? ""}
                      onChange={(e) => setAccounts((a) => ({ ...a, [item.receiptId]: e.target.value }))}
                    >
                      {batch.accounts.map((a) => (
                        <option key={a.number} value={a.number}>
                          {a.number} {a.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {batch.more ? (
            <p className="type-caption text-[var(--ink-muted)]">More receipts are being prepared: refresh to see them.</p>
          ) : null}
          {unknownPayer ? (
            <fieldset className="space-y-1">
              <legend className="type-caption font-semibold text-[var(--ink-muted)] mb-1">
                Who paid for the chosen receipts that don&apos;t say?
              </legend>
              {(
                [
                  ["company", "The company's card or account"],
                  ["employee", "Someone's own money (to pay back)"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 min-h-11 type-body text-[var(--ink)]">
                  <input
                    type="radio"
                    name={`batch-paid-by-${organizationId}`}
                    value={value}
                    checked={paidBy === value}
                    onChange={() => setPaidBy(value)}
                    className="size-4 accent-[var(--ink)]"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : null}
          <Button type="button" className="w-full h-11" onClick={approve} disabled={busy || chosen === 0 || (unknownPayer && !paidBy)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
            {chosen === 0 ? "Choose vouchers to approve" : `Approve and book ${chosen} in Fortnox`}
          </Button>
          <p className="type-caption text-[var(--ink-muted)]">
            A voucher in Fortnox can&apos;t be deleted, only reversed. Check the accounts before approving.
          </p>
        </>
      )}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            message.ok
              ? "text-sm font-semibold text-[var(--ink)]"
              : "text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2"
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
