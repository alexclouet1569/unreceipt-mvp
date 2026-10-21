"use client";

import { cn } from "@/lib/utils";
import { relativeDayGroup, splitFormattedAmount } from "@/lib/receipt-format";
import { useI18n } from "@/lib/i18n/client";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import { MerchantLogo } from "@/components/receipt/MerchantLogo";
import type { Receipt } from "@/lib/types";

type ReceiptListItemProps = {
  receipt: Receipt;
  onClick?: () => void;
};

export function ReceiptListItem({ receipt, onClick }: ReceiptListItemProps) {
  const { locale, t: messages } = useI18n();
  const t = messages.dashboard.item;
  const categoryLabel =
    messages.common.categories[receipt.category] ?? messages.common.categories.other;
  const interactive = Boolean(onClick);
  const merchant = receipt.merchant_name ?? t.unknownMerchant;
  const { value, suffix } = splitFormattedAmount(
    receipt.total,
    receipt.currency,
    locale,
  );
  const pending = receipt.status === "pending_review";

  return (
    <div
      data-day-group={relativeDayGroup(receipt.receipt_date, new Date(), locale)}
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
          {categoryLabel}
          <span style={{ margin: "0 6px" }} aria-hidden="true">
            ·
          </span>
          {formatRelative(receipt.receipt_date, locale, t)}
          {pending ? (
            <>
              <span style={{ margin: "0 6px" }} aria-hidden="true">
                ·
              </span>
              <span
                className="font-accent italic"
                style={{
                  color: "var(--attention-mint)",
                  fontWeight: 500,
                }}
              >
                {t.needsReview}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact relative-time string for the card meta row. Different cadence
 * than the day-group bucket header — this is "2h ago", "3d ago", "May 4".
 */
function formatRelative(
  dateStr: string | null | undefined,
  locale: Locale,
  t: Messages["dashboard"]["item"],
): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return t.minutesAgo(Math.max(0, minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return t.daysAgo(days);
  return d.toLocaleDateString(INTL_LOCALE[locale], {
    month: "short",
    day: "numeric",
  });
}
