"use client";

import { CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  CATEGORY_CONFIG,
  formatAmount,
  formatDate,
} from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";

type ReceiptDetailCardProps = {
  receipt: Receipt;
};

/**
 * The "digital receipt" card the customer sees and the founder previews
 * before saving. Renders all of the merchant + totals + payment +
 * verification footer block in one place.
 */
export function ReceiptDetailCard({ receipt }: ReceiptDetailCardProps) {
  const config = CATEGORY_CONFIG[receipt.category];
  const taxRate = receipt.tax_rate;
  const showTax = receipt.tax_amount != null && receipt.tax_amount > 0;
  const showTip = receipt.tip_amount != null && receipt.tip_amount > 0;

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-background overflow-hidden">
      <div className="bg-primary/10 px-5 py-4 text-center">
        <p className="font-bold text-base">
          {receipt.merchant_name ?? "Unknown merchant"}
        </p>
        {receipt.merchant_address ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            {receipt.merchant_address}
          </p>
        ) : null}
        {receipt.merchant_phone ? (
          <p className="text-xs text-muted-foreground">
            {receipt.merchant_phone}
          </p>
        ) : null}
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {formatDate(receipt.receipt_date)}
            {receipt.receipt_time ? ` · ${receipt.receipt_time}` : ""}
          </span>
          {receipt.receipt_number ? (
            <span className="text-muted-foreground font-mono">
              {receipt.receipt_number}
            </span>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Category</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.badgeClass}`}>
              {config.label}
            </span>
          </div>
          {receipt.subtotal != null ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                {formatAmount(receipt.subtotal, receipt.currency)}
              </span>
            </div>
          ) : null}
          {showTax ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {taxRate != null ? `VAT (${taxRate}%)` : "VAT"}
              </span>
              <span className="tabular-nums">
                {formatAmount(receipt.tax_amount, receipt.currency)}
              </span>
            </div>
          ) : null}
          {showTip ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tip</span>
              <span className="tabular-nums">
                {formatAmount(receipt.tip_amount, receipt.currency)}
              </span>
            </div>
          ) : null}
          <Separator />
          <div className="flex justify-between text-base font-bold pt-1">
            <span>Total</span>
            <span className="tabular-nums">
              {formatAmount(receipt.total, receipt.currency)}
            </span>
          </div>
        </div>

        {receipt.payment_method || receipt.transaction_ref || receipt.merchant_vat_number ? (
          <>
            <Separator />
            <div className="space-y-1 text-xs">
              {receipt.payment_method ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment</span>
                  <span>{receipt.payment_method}</span>
                </div>
              ) : null}
              {receipt.transaction_ref ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction</span>
                  <span className="font-mono">{receipt.transaction_ref}</span>
                </div>
              ) : null}
              {receipt.merchant_vat_number ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT No.</span>
                  <span className="font-mono">{receipt.merchant_vat_number}</span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {receipt.notes ? (
          <>
            <Separator />
            <div className="text-xs">
              <p className="text-muted-foreground mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{receipt.notes}</p>
            </div>
          </>
        ) : null}
      </div>

      <div className="bg-primary/10 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
          </div>
          <div>
            <p className="text-xs font-semibold text-primary">
              Verified by UnReceipt
            </p>
            {receipt.verification_code ? (
              <p className="text-[10px] text-muted-foreground font-mono">
                {receipt.verification_code}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground capitalize">
          {receipt.source}
        </p>
      </div>
    </div>
  );
}
