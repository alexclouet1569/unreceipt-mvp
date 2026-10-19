"use client";

import { Check } from "lucide-react";
import { Amount } from "@/components/accountant/Amount";
import { MerchantLogo } from "@/components/receipt/MerchantLogo";
import type { LineOverride, MatchableReceipt, ReconciledLine } from "@/lib/reconcile/match";

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function shortDate(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`));
}

type Props = {
  item: ReconciledLine;
  receipt?: MatchableReceipt;
  /** The receipt came in reply to the reminder. */
  arrived?: boolean;
  /** Absent: the row offers no override (money in, or nothing to decide). */
  onOverride?: (override: LineOverride | null) => void;
};

/**
 * One bank line in the accountant view: date, the bank's text and amount,
 * and underneath what we found for it. Missing lines carry the honey rule
 * that marks review-needed receipts in the inbox.
 */
export function StatementLineRow({ item, receipt, arrived, onOverride }: Props) {
  const { line, status, note } = item;
  const missing = status === "missing";
  const label = `${line.text || "bank line"}, ${shortDate(line.date)}`;

  return (
    <li
      data-status={status}
      className="flex gap-3"
      style={{
        padding: "12px 14px",
        paddingLeft: missing ? "11px" : "14px",
        borderLeft: missing ? "3px solid var(--attention)" : undefined,
      }}
    >
      <p
        className="shrink-0 tabular-nums text-[var(--ink-muted)]"
        style={{ width: "48px", fontSize: "13px", fontWeight: 500, paddingTop: "1px" }}
      >
        {shortDate(line.date)}
      </p>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[var(--ink)]" style={{ fontSize: "14px", fontWeight: 600 }}>
            {line.text || "—"}
          </p>
          <Amount value={line.amount} currency={line.currency} sign={line.amount < 0 ? "out" : "in"} />
        </div>

        {status === "matched" && receipt ? (
          <div
            className="flex items-center gap-1.5 text-[var(--ink-muted)]"
            style={{ fontSize: "13px", fontWeight: 500, marginTop: "4px" }}
          >
            <Check size={14} strokeWidth={2.5} aria-hidden="true" />
            <MerchantLogo merchant={receipt.merchant_name ?? "?"} size={18} radius={6} />
            <span className="truncate">
              {receipt.merchant_name} · {receipt.receipt_date ? shortDate(receipt.receipt_date) : "no date"}
            </span>
            {arrived ? <span className="shrink-0 font-accent italic">sent by client</span> : null}
          </div>
        ) : null}

        {status === "check" ? (
          <p className="text-[var(--attention-deep)]" style={{ fontSize: "13px", fontWeight: 500, marginTop: "4px" }}>
            <CheckNote item={item} receipt={receipt} />
          </p>
        ) : null}

        {missing ? (
          <div className="flex items-center justify-between gap-3" style={{ marginTop: "4px" }}>
            <p className="text-[var(--attention-deep)]" style={{ fontSize: "13px", fontWeight: 600 }}>
              No receipt yet
            </p>
            {onOverride ? (
              <OverrideButton label={`Mark ${label} as needing no receipt`} onClick={() => onOverride("no_receipt")}>
                No receipt needed
              </OverrideButton>
            ) : null}
          </div>
        ) : null}

        {status === "no_receipt" ? (
          <div className="flex items-center justify-between gap-3" style={{ marginTop: "4px" }}>
            <p className="text-[var(--ink-faint)]" style={{ fontSize: "13px", fontWeight: 500 }}>
              {note}
            </p>
            {onOverride ? (
              <OverrideButton label={`Mark ${label} as needing a receipt`} onClick={() => onOverride("needs_receipt")}>
                Needs a receipt
              </OverrideButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** The "check" sentence, with both amounts in mono. */
function CheckNote({ item, receipt }: { item: ReconciledLine; receipt?: MatchableReceipt }) {
  const { line, check, note } = item;
  if (!receipt || receipt.total == null || check === null) return <>{note}</>;
  const shop = receipt.merchant_name ?? "an unnamed shop";
  const theirs = <Amount inline value={receipt.total} currency={receipt.currency} />;
  const bank = <Amount inline value={line.amount} currency={line.currency} />;
  if (check === "different_shop") {
    return <>Same amount and date, but the receipt is from {shop}.</>;
  }
  if (check === "different_currency") {
    return (
      <>
        The receipt from {shop} is in {receipt.currency} ({theirs}); the bank charged {bank}.
      </>
    );
  }
  return (
    <>
      The {shop} receipt says {theirs}, the bank {bank}. A tip or a partial refund?
    </>
  );
}

function OverrideButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 underline underline-offset-2 text-[var(--ink-muted)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
      style={{ fontSize: "13px", fontWeight: 600, minHeight: "44px", margin: "-12px -8px", padding: "0 8px" }}
    >
      {children}
    </button>
  );
}
