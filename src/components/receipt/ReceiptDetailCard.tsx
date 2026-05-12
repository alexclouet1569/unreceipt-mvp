"use client";

import { CheckCircle2 } from "lucide-react";
import { PerfEdge } from "@/components/brand/PerfEdge";
import {
  CATEGORY_CONFIG,
  formatAmount,
  formatDate,
  splitFormattedAmount,
} from "@/lib/receipt-format";
import { getMerchantColor, getMerchantInitials } from "@/lib/merchant-display";
import type { Receipt } from "@/lib/types";

type ReceiptDetailCardProps = {
  receipt: Receipt;
};

/**
 * The "digital receipt" card the customer sees and the founder previews
 * before saving. Renders all of the merchant + totals + payment +
 * verification footer block in one place per DESIGN.md "Nordic-Quiet
 * Premium" spec.
 */
export function ReceiptDetailCard({ receipt }: ReceiptDetailCardProps) {
  const config = CATEGORY_CONFIG[receipt.category];
  const taxRate = receipt.tax_rate;
  const showTax = receipt.tax_amount != null && receipt.tax_amount > 0;
  const showTip = receipt.tip_amount != null && receipt.tip_amount > 0;
  const merchant = receipt.merchant_name ?? "Unknown merchant";
  const initials = getMerchantInitials(merchant);
  const logoColor = getMerchantColor(merchant);
  const total = splitFormattedAmount(receipt.total, receipt.currency);

  const hasMeta =
    receipt.payment_method ||
    receipt.transaction_ref ||
    receipt.merchant_vat_number;

  return (
    <div
      className="rounded-[16px] bg-card overflow-hidden border border-[var(--hairline)]"
      data-testid="receipt-detail-card"
    >
      <PerfEdge variant="edge" direction="top" />

      {/* Receipt header micro-label */}
      <div
        className="px-5 pt-4 pb-2 text-[var(--ink-faint)]"
        style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Receipt{receipt.receipt_number ? ` · ${receipt.receipt_number}` : ""}
      </div>

      {/* Merchant block */}
      <div className="px-5 pb-4 flex items-start gap-3">
        <div
          className="rounded-[14px] flex items-center justify-center shrink-0 text-white"
          style={{
            width: "56px",
            height: "56px",
            background: logoColor,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "18px",
            letterSpacing: "-0.01em",
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="font-display font-bold text-[var(--ink)] truncate"
            style={{ fontSize: "20px", letterSpacing: "-0.02em" }}
          >
            {merchant}
          </p>
          {receipt.merchant_address ? (
            <p
              className="text-[var(--ink-muted)] truncate"
              style={{ fontSize: "13px", marginTop: "2px" }}
            >
              {receipt.merchant_address}
            </p>
          ) : null}
          <p
            className="text-[var(--ink-faint)]"
            style={{ fontSize: "12px", marginTop: "2px" }}
          >
            {config.label}
          </p>
        </div>
      </div>

      {/* Display total */}
      <div className="px-5 pb-5">
        <p
          className="font-mono tabular-nums text-[var(--ink)] leading-none"
          style={{ fontSize: "40px", fontWeight: 500, letterSpacing: "-0.02em" }}
        >
          {total.value}
          {total.suffix ? (
            <span
              className="text-[var(--ink-faint)]"
              style={{ fontSize: "18px", marginLeft: "6px", verticalAlign: "4px" }}
            >
              {total.suffix}
            </span>
          ) : null}
        </p>
        <p
          className="text-[var(--ink-muted)]"
          style={{ fontSize: "14px", marginTop: "6px" }}
        >
          {formatDate(receipt.receipt_date)}
          {receipt.receipt_time ? ` · ${receipt.receipt_time}` : ""}
          {receipt.card_last_four ? ` · Card ending ${receipt.card_last_four}` : ""}
        </p>
      </div>

      <PerfEdge variant="divider" />

      {/* Totals breakdown */}
      <div className="px-5 py-5 space-y-2">
        {receipt.subtotal != null ? (
          <DetailRow
            label="Subtotal"
            value={formatAmount(receipt.subtotal, receipt.currency)}
          />
        ) : null}
        {showTip ? (
          <DetailRow
            label="Tip"
            value={formatAmount(receipt.tip_amount, receipt.currency)}
          />
        ) : null}
      </div>

      {/* VAT panel (brand-tint) */}
      {showTax ? (
        <div className="px-5 pb-5">
          <div
            className="rounded-[10px] px-4 py-3 flex items-center justify-between"
            style={{
              background: "var(--brand-tint, #ECF7E7)",
              border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
            }}
          >
            <span
              className="text-[var(--ink)]"
              style={{ fontSize: "13px", fontWeight: 600 }}
            >
              {taxRate != null ? `VAT (${taxRate}%)` : "VAT"}
            </span>
            <span
              className="font-mono tabular-nums text-[var(--ink)]"
              style={{ fontSize: "14px", fontWeight: 500 }}
            >
              {formatAmount(receipt.tax_amount, receipt.currency)}
            </span>
          </div>
        </div>
      ) : null}

      {hasMeta ? (
        <>
          <PerfEdge variant="divider" />
          <div className="px-5 py-5 space-y-2">
            {receipt.payment_method ? (
              <DetailRow label="Payment" value={receipt.payment_method} mono={false} />
            ) : null}
            {receipt.transaction_ref ? (
              <DetailRow label="Transaction" value={receipt.transaction_ref} />
            ) : null}
            {receipt.merchant_vat_number ? (
              <DetailRow label="VAT No." value={receipt.merchant_vat_number} />
            ) : null}
          </div>
        </>
      ) : null}

      {receipt.notes ? (
        <>
          <PerfEdge variant="divider" />
          <div className="px-5 py-5">
            <p
              className="text-[var(--ink-faint)]"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Notes
            </p>
            <p
              className="text-[var(--ink)] whitespace-pre-wrap"
              style={{ fontSize: "14px" }}
            >
              {receipt.notes}
            </p>
          </div>
        </>
      ) : null}

      {/* Verification footer */}
      <PerfEdge variant="divider" />
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {receipt.is_verified ? (
            <>
              <div
                className="rounded-full flex items-center justify-center"
                style={{ width: "20px", height: "20px", background: "var(--primary)" }}
              >
                <CheckCircle2 className="w-3 h-3 text-white" />
              </div>
              <div>
                <p
                  className="text-[var(--ink)]"
                  style={{ fontSize: "12px", fontWeight: 600 }}
                >
                  Verified by UnReceipt
                </p>
                {receipt.verification_code ? (
                  <p
                    className="font-mono text-[var(--ink-faint)]"
                    style={{ fontSize: "10px" }}
                  >
                    {receipt.verification_code}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p
              className="text-[var(--ink-faint)]"
              style={{ fontSize: "12px", fontWeight: 500 }}
            >
              Awaiting verification
            </p>
          )}
        </div>
        <p
          className="text-[var(--ink-faint)] capitalize"
          style={{ fontSize: "10px" }}
        >
          {receipt.source}
        </p>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-[var(--ink-muted)]"
        style={{ fontSize: "14px" }}
      >
        {label}
      </span>
      <span
        className={mono ? "font-mono tabular-nums text-[var(--ink)]" : "text-[var(--ink)]"}
        style={{ fontSize: "14px" }}
      >
        {value}
      </span>
    </div>
  );
}
