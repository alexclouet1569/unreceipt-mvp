"use client";

import { cn } from "@/lib/utils";
import {
  CATEGORY_CONFIG,
  relativeDayGroup,
  splitFormattedAmount,
} from "@/lib/receipt-format";
import { getMerchantColor, getMerchantInitials } from "@/lib/merchant-display";
import type { Receipt } from "@/lib/types";

type ReceiptListItemProps = {
  receipt: Receipt;
  onClick?: () => void;
};

export function ReceiptListItem({ receipt, onClick }: ReceiptListItemProps) {
  const config = CATEGORY_CONFIG[receipt.category];
  const interactive = Boolean(onClick);
  const merchant = receipt.merchant_name ?? "Unknown merchant";
  const initials = getMerchantInitials(merchant);
  const logoColor = getMerchantColor(merchant);
  const { value, suffix } = splitFormattedAmount(
    receipt.total,
    receipt.currency,
  );

  return (
    <div
      data-day-group={relativeDayGroup(receipt.receipt_date)}
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
      className={cn(
        "flex items-center gap-3 bg-card rounded-[12px]",
        "border border-[var(--hairline)]",
        "px-[14px] py-[12px]",
        "transition-transform duration-[120ms] ease-out",
        interactive &&
          "cursor-pointer hover:border-[color-mix(in_srgb,var(--brand)_30%,var(--hairline))] active:scale-[0.985]",
      )}
    >
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 text-white"
        style={{
          background: logoColor,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "14px",
          letterSpacing: "-0.01em",
        }}
        aria-hidden="true"
      >
        {initials}
      </div>
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
                className="text-[var(--ink-faint)]"
                style={{ fontSize: "11px", marginLeft: "3px" }}
              >
                {suffix}
              </span>
            ) : null}
          </p>
        </div>
        <p
          className="text-[var(--ink-faint)] truncate"
          style={{ fontSize: "13px", fontWeight: 500, marginTop: "4px" }}
        >
          {config.label}
          <span style={{ margin: "0 6px" }} aria-hidden="true">
            ·
          </span>
          {formatRelative(receipt.receipt_date)}
        </p>
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
