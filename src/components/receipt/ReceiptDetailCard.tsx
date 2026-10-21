"use client";

import { Check, Paperclip, Pencil } from "lucide-react";
import { PerfEdge } from "@/components/brand/PerfEdge";
import { Wordmark } from "@/components/brand/Wordmark";
import { MerchantLogo } from "@/components/receipt/MerchantLogo";
import {
  formatAmount,
  formatDate,
  formatQty,
  splitFormattedAmount,
} from "@/lib/receipt-format";
import { editedFieldLabels, editedOnLabel } from "@/lib/receipts/edits";
import { useI18n } from "@/lib/i18n/client";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/locale";
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
  const { locale, t: messages } = useI18n();
  const t = messages.receipt.card;
  const categoryLabel =
    messages.common.categories[receipt.category] ?? messages.common.categories.other;
  const currency = receipt.currency;
  const merchant = receipt.merchant_name ?? messages.receipt.unknownMerchant;
  const total = splitFormattedAmount(receipt.total, currency, locale);
  const showTax = receipt.tax_amount != null && receipt.tax_amount > 0;
  const showTip = receipt.tip_amount != null && receipt.tip_amount > 0;
  const net =
    showTax && receipt.total != null
      ? Math.round((receipt.total - (receipt.tax_amount ?? 0)) * 100) / 100
      : null;
  const editedOn = editedOnLabel(receipt, locale);
  const editedFields = editedFieldLabels(receipt, locale);
  const hasOriginal = Boolean(receipt.image_url || receipt.original_source_url);
  const hasMeta =
    receipt.payment_method || receipt.transaction_ref || receipt.merchant_vat_number;

  const when = [
    formatDate(receipt.receipt_date, locale),
    receipt.receipt_time,
    receipt.card_last_four ? t.cardEnding(receipt.card_last_four) : null,
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
            {t.digitalReceipt}
            {receipt.receipt_number ? t.receiptNo(receipt.receipt_number) : ""}
          </p>
        </header>

        <div className="mt-4 flex items-center gap-3">
          <MerchantLogo merchant={merchant} size={48} radius={12} />
          <div className="min-w-0">
            <p className="truncate text-[18px] font-bold tracking-[-0.01em]">{merchant}</p>
            <p className="truncate text-[13px] font-medium text-[var(--ink-muted)]">
              {receipt.merchant_address ?? categoryLabel}
            </p>
            {receipt.merchant_address ? (
              <p className="text-[12px] font-medium text-[var(--ink-muted)]">{categoryLabel}</p>
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
              {t.editedOn(editedOn)}
              {editedFields.length > 0 ? ` · ${editedFields.join(", ")}` : ""}
            </span>
          </p>
        ) : null}

        {receipt.items && receipt.items.length > 0 ? (
          <>
            <Rule />
            <ul className="space-y-1.5" aria-label={t.items}>
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
                                  {formatAmount(item.unit_amount, currency, locale)}
                                </span>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </>
                    }
                    value={formatNumber(item.total_amount, locale)}
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
              <Leader label={t.subtotal} value={formatAmount(receipt.subtotal, currency, locale)} mono />
            ) : null}
            {showTip ? (
              <Leader label={t.tip} value={formatAmount(receipt.tip_amount, currency, locale)} mono />
            ) : null}
          </div>
        ) : null}

        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-extrabold tracking-[0.04em] uppercase">{t.total}</span>
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
            <Leader
              label={receipt.tax_rate != null ? t.vatRate(String(receipt.tax_rate)) : t.vat}
              value={formatAmount(receipt.tax_amount, currency, locale)}
              mono
            />
            {net != null ? (
              <Leader label={t.exclVat} value={formatAmount(net, currency, locale)} mono />
            ) : null}
          </div>
        ) : null}

        {hasMeta ? (
          <>
            <Rule />
            <div className="space-y-1">
              {receipt.payment_method ? (
                <Leader label={t.payment} value={receipt.payment_method} />
              ) : null}
              {receipt.transaction_ref ? (
                <Leader label={t.transaction} value={receipt.transaction_ref} />
              ) : null}
              {receipt.merchant_vat_number ? (
                <Leader label={t.vatNo} value={receipt.merchant_vat_number} />
              ) : null}
            </div>
          </>
        ) : null}

        {receipt.notes ? (
          <>
            <Rule />
            <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-muted)] uppercase">
              {t.notes}
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
                {editedOn ? t.verifiedThenEdited : t.verified}
              </span>
            ) : receipt.status === "pending_review" ? (
              <span className="text-[12px] font-semibold text-[var(--attention-deep)]">
                {t.needsReview}
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-[var(--ink-muted)]">
                {receipt.source === "paper" || receipt.source === "manual"
                  ? t.checkedByYou
                  : t.readAutomatically}
              </span>
            )}
            {hasOriginal ? (
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink-muted)]">
                <Paperclip className="size-3.5" aria-hidden="true" />
                {t.originalAttached}
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-[var(--ink-muted)] capitalize">
                {t.sources[receipt.source] ?? receipt.source}
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

/** Label … dotted leader … value, the receipt line. `mono` only for amounts. */
function Leader({
  label,
  value,
  mono = false,
  wrap = false,
}: {
  label: React.ReactNode;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
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
            ? `shrink-0 ${mono ? "font-mono tabular-nums" : ""}`
            : `min-w-0 text-right break-words ${mono ? "font-mono tabular-nums" : ""}`
        }
      >
        {value}
      </span>
    </div>
  );
}

function formatNumber(n: number, locale: Locale): string {
  return n
    .toLocaleString(INTL_LOCALE[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\u202f/g, "\u00a0");
}
