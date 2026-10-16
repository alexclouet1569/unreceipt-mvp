"use client";

import { Check, Paperclip, Pencil } from "lucide-react";
import { PerfEdge } from "@/components/brand/PerfEdge";
import { Wordmark } from "@/components/brand/Wordmark";
import { MerchantLogo } from "@/components/receipt/MerchantLogo";
import {
  CATEGORY_CONFIG,
  formatAmount,
  formatDate,
  formatQty,
  splitFormattedAmount,
} from "@/lib/receipt-format";
import { editedFieldLabels, editedOnLabel } from "@/lib/receipts/edits";
import type { Receipt } from "@/lib/types";

type ReceiptDetailCardProps = {
  receipt: Receipt;
};

/**
 * The digital receipt: a clean paper copy of what was bought, shown right
 * after a capture is saved and in the receipt detail view. Perforated top,
 * torn bottom, dotted leaders between labels and amounts (DESIGN.md
 * "Digital receipt"). Branded UnReceipt — the store gets a logo badge,
 * never the letterhead, so it can't pass for a receipt the store issued.
 */
export function ReceiptDetailCard({ receipt }: ReceiptDetailCardProps) {
  const config = CATEGORY_CONFIG[receipt.category];
  const currency = receipt.currency;
  const merchant = receipt.merchant_name ?? "Unknown merchant";
  const total = splitFormattedAmount(receipt.total, currency);
  const showTax = receipt.tax_amount != null && receipt.tax_amount > 0;
  const showTip = receipt.tip_amount != null && receipt.tip_amount > 0;
  const net =
    showTax && receipt.total != null
      ? Math.round((receipt.total - (receipt.tax_amount ?? 0)) * 100) / 100
      : null;
  const editedOn = editedOnLabel(receipt);
  const editedFields = editedFieldLabels(receipt);
  const hasOriginal = Boolean(receipt.image_url || receipt.original_source_url);
  const hasMeta =
    receipt.payment_method ||
    receipt.transaction_ref ||
    receipt.merchant_vat_number ||
    receipt.merchant_org_number ||
    receipt.buyer_name ||
    receipt.buyer_address;
  // Several VAT rates on one receipt (a grocery receipt mixes 6 % and 25 %).
  const vatLines =
    receipt.vat_breakdown && receipt.vat_breakdown.length > 1 ? receipt.vat_breakdown : null;
  const billedTo = [receipt.buyer_name, receipt.buyer_address].filter(Boolean).join(", ");

  const when = [
    formatDate(receipt.receipt_date),
    receipt.receipt_time,
    receipt.card_last_four ? `Card •••• ${receipt.card_last_four}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="receipt-torn flex flex-col border border-t-0 border-b-0 border-[var(--hairline)] bg-card text-[var(--ink)]"
      data-testid="receipt-detail-card"
    >
      <PerfEdge variant="edge" direction="top" />

      <div className="flex flex-col px-5 pt-3 pb-7">
        <header className="flex flex-col items-center gap-0.5">
          <Wordmark variant="wordmark" style={{ fontSize: "17px" }} />
          <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-muted)] uppercase">
            Digital receipt{receipt.receipt_number ? ` · No. ${receipt.receipt_number}` : ""}
          </p>
        </header>

        <div className="mt-4 flex items-center gap-3">
          <MerchantLogo merchant={merchant} size={48} radius={12} />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-bold tracking-[-0.01em]">{merchant}</p>
            <p className="truncate text-[13px] font-medium text-[var(--ink-muted)]">
              {receipt.merchant_address ?? config.label}
            </p>
            {receipt.merchant_address ? (
              <p className="text-[12px] font-medium text-[var(--ink-muted)]">{config.label}</p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-[12px] font-medium text-[var(--ink-muted)] tabular-nums">{when}</p>

        {editedOn ? (
          <p
            data-testid="receipt-edited-marker"
            className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-[var(--ink-muted)]"
          >
            <Pencil className="mt-[2px] size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Edited by you on {editedOn}
              {editedFields.length > 0 ? ` · ${editedFields.join(", ")}` : ""}
            </span>
          </p>
        ) : null}

        {receipt.items && receipt.items.length > 0 ? (
          <>
            <Rule />
            <ul className="space-y-1.5" aria-label="Items">
              {receipt.items.map((item, idx) => (
                <li key={idx}>
                  <Leader
                    label={
                      <>
                        {item.label}
                        {item.qty != null && item.qty !== 1 ? (
                          <span className="font-medium">
                            {` × ${formatQty(item.qty)}`}
                            {item.unit_amount != null ? (
                              <>
                                {" @ "}
                                <span className="font-mono tabular-nums">
                                  {formatAmount(item.unit_amount, currency)}
                                </span>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </>
                    }
                    value={formatNumber(item.total_amount)}
                    mono
                    wrap
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <Rule />

        {receipt.subtotal != null || showTip ? (
          <div className="mb-2 space-y-1">
            {receipt.subtotal != null ? (
              <Leader label="Subtotal" value={formatAmount(receipt.subtotal, currency)} mono />
            ) : null}
            {showTip ? <Leader label="Tip" value={formatAmount(receipt.tip_amount, currency)} mono /> : null}
          </div>
        ) : null}

        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-extrabold tracking-[0.04em] uppercase">Total</span>
          <span className="flex-1" />
          <span className="font-mono text-[24px] font-semibold tracking-[-0.01em] tabular-nums">
            {total.value}
            {total.suffix ? (
              <span className="ml-1 text-[13px] font-medium text-[var(--ink-muted)]">
                {total.suffix}
              </span>
            ) : null}
          </span>
        </div>

        {showTax ? (
          <div className="mt-2 space-y-1">
            {vatLines ? (
              vatLines.map((line, i) => (
                <Leader
                  key={`${line.rate}-${i}`}
                  label={`VAT ${line.rate} %`}
                  value={formatAmount(line.vat_amount, currency)}
                  mono
                />
              ))
            ) : (
              <Leader
                label={receipt.tax_rate != null ? `VAT ${receipt.tax_rate} %` : "VAT"}
                value={formatAmount(receipt.tax_amount, currency)}
                mono
              />
            )}
            {net != null ? <Leader label="Excl. VAT" value={formatAmount(net, currency)} mono /> : null}
          </div>
        ) : null}

        {hasMeta ? (
          <>
            <Rule />
            <div className="space-y-1">
              {receipt.payment_method ? (
                <Leader label="Payment" value={receipt.payment_method} />
              ) : null}
              {receipt.transaction_ref ? (
                <Leader label="Transaction" value={receipt.transaction_ref} />
              ) : null}
              {receipt.merchant_vat_number ? (
                <Leader label="VAT No." value={receipt.merchant_vat_number} numeric />
              ) : null}
              {receipt.merchant_org_number ? (
                <Leader label="Org. No." value={receipt.merchant_org_number} numeric />
              ) : null}
              {billedTo ? <Leader label="Billed to" value={billedTo} /> : null}
            </div>
          </>
        ) : null}

        {receipt.notes ? (
          <>
            <Rule />
            <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-muted)] uppercase">
              Notes
            </p>
            <p className="mt-1 text-[14px] whitespace-pre-wrap">{receipt.notes}</p>
          </>
        ) : null}

        <Rule />

        <footer className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {receipt.is_verified ? (
              <span className="inline-flex -rotate-6 items-center gap-1 rounded-[6px] border-2 border-[var(--brand)] px-2.5 py-1 text-[12px] font-extrabold tracking-[0.08em] text-[var(--brand-action)] uppercase">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                {editedOn ? "Verified, then edited" : "Verified"}
              </span>
            ) : receipt.status === "pending_review" ? (
              <span className="text-[12px] font-semibold text-[var(--attention-deep)]">
                Needs review
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-[var(--ink-muted)]">
                {receipt.source === "paper" || receipt.source === "manual"
                  ? "Checked by you"
                  : "Read automatically"}
              </span>
            )}
            {hasOriginal ? (
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink-muted)]">
                <Paperclip className="size-3.5" aria-hidden="true" />
                Original attached
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-[var(--ink-muted)] capitalize">
                {receipt.source}
              </span>
            )}
          </div>
          {receipt.verification_code ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="receipt-barcode h-8 w-[78%]" aria-hidden="true" />
              <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--ink-muted)] tabular-nums">
                {receipt.verification_code}
              </p>
            </div>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

function Rule() {
  return <div className="my-3 border-t border-dashed border-[var(--hairline)]" aria-hidden="true" />;
}

/**
 * Label … dotted leader … value, the receipt line. `mono` only for amounts;
 * `numeric` (tabular figures in Manrope) for ids and codes.
 */
function Leader({
  label,
  value,
  mono = false,
  numeric = false,
  wrap = false,
}: {
  label: React.ReactNode;
  value: string;
  mono?: boolean;
  numeric?: boolean;
  wrap?: boolean;
}) {
  const figures = mono ? "font-mono tabular-nums" : numeric ? "tabular-nums" : "";
  return (
    <div className="flex items-baseline gap-2 text-[14px]">
      <span
        className={
          wrap
            ? "min-w-0 font-semibold break-words text-[var(--ink-muted)]"
            : "shrink-0 font-semibold text-[var(--ink-muted)]"
        }
      >
        {label}
      </span>
      <span
        className="min-w-4 flex-1 translate-y-[-4px] border-b border-dotted border-[var(--hairline)]"
        aria-hidden="true"
      />
      <span
        className={
          wrap
            ? `shrink-0 ${figures}`
            : `min-w-0 text-right break-words ${figures}`
        }
      >
        {value}
      </span>
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
