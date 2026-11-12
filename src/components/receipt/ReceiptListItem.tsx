"use client";

import { cn } from "@/lib/utils";
import {
  CATEGORY_CONFIG,
  relativeDayGroup,
  splitFormattedAmount,
} from "@/lib/receipt-format";
import { MerchantLogo } from "@/components/receipt/MerchantLogo";
import type { Receipt } from "@/lib/types";
import { missingFieldsText, missingRequiredFields } from "@/lib/receipts/status";

type ReceiptListItemProps = {
  receipt: Receipt;
  onClick?: () => void;
};

export function ReceiptListItem({ receipt, onClick }: ReceiptListItemProps) {
  const config = CATEGORY_CONFIG[receipt.category];
  const interactive = Boolean(onClick);
  const merchant = receipt.merchant_name ?? "Unknown merchant";
  const { value, suffix } = splitFormattedAmount(
    receipt.total,
    receipt.currency,
  );
  const pending = receipt.status === "pending_review";
  // What a person still has to fill in; nothing when the receipt only
  // waits for a confirmation (read with low confidence, untrusted sender).
  const missing = pending ? missingRequiredFields(receipt) : [];
  // A foreign receipt also shows its amount in the company's currency.
  const converted =
    receipt.home_total != null &&
    receipt.home_currency != null &&
    receipt.home_currency !== receipt.currency
      ? splitFormattedAmount(receipt.home_total, receipt.home_currency)
      : null;

  return (
    <div
      data-day-group={relativeDayGroup(receipt.receipt_date)}
      data-status={receipt.status}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={
        pending
          ? {
              borderLeft: "3px solid var(--attention)",
              paddingLeft: "12px",
            }
          : undefined
      }
      className={cn(
        "flex items-center gap-3 bg-card rounded-[12px]",
        "border border-[var(--hairline)]",
        "px-[14px] py-[12px]",
        "transition-transform duration-[120ms] ease-out",
        // Inset, so a wrapper that clips (swipe to delete) can't hide it.
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]",
        interactive &&
          "cursor-pointer hover:border-[color-mix(in_srgb,var(--brand)_30%,var(--hairline))] active:scale-[0.985]",
      )}
    >
      <MerchantLogo merchant={merchant} size={40} radius={10} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="font-display font-bold truncate text-[var(--ink)] leading-tight"
            style={{ fontSize: "15px", letterSpacing: "-0.01em" }}
          >
            {merchant}
          </p>
          <p
            className="font-mono font-medium tabular-nums shrink-0 text-[var(--ink)] leading-tight"
            style={{ fontSize: "18px", letterSpacing: "-0.01em" }}
          >
            {value}
            {suffix ? (
              <span
                className="text-[var(--ink-muted)]"
                style={{ fontSize: "11px", marginLeft: "3px" }}
              >
                {suffix}
              </span>
            ) : null}
          </p>
        </div>
        <div
          className="flex items-baseline justify-between gap-3"
          style={{ marginTop: "4px" }}
        >
          <p
            className="text-[var(--ink-muted)] truncate min-w-0"
            style={{ fontSize: "13px", fontWeight: 500 }}
          >
            {/* First, so a narrow card truncates the date, not this. */}
            {pending ? (
              <>
                {missing.length > 0 ? (
                  <span
                    className="text-[var(--negative)]"
                    style={{ fontWeight: 600 }}
                  >
                    Missing {missingFieldsText(missing)}
                  </span>
                ) : (
                  <span
                    className="text-[var(--attention-deep)]"
                    style={{ fontWeight: 600 }}
                  >
                    To confirm
                  </span>
                )}
                <span style={{ margin: "0 6px" }} aria-hidden="true">
                  ·
                </span>
              </>
            ) : null}
            {config.label}
            <span style={{ margin: "0 6px" }} aria-hidden="true">
              ·
            </span>
            {formatRelative(receipt.receipt_date)}
          </p>
          {converted ? (
          <p
            className="font-mono tabular-nums shrink-0 text-[var(--ink-muted)]"
            style={{ fontSize: "14px", fontWeight: 400 }}
          >
            ≈ {converted.value}
            {converted.suffix ? (
              <span style={{ fontSize: "11px", marginLeft: "3px" }}>{converted.suffix}</span>
            ) : null}
          </p>
        ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact relative-time string for the card meta row. Different cadence
 * than the day-group bucket header — this is "2h ago", "3d ago", "May 4".
 */
function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(0, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
