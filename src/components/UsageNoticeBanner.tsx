"use client";

import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import type { UsageNotice } from "@/lib/usage-copy";
import { Money } from "@/components/Money";
import { useI18n } from "@/lib/i18n/client";

/**
 * Thin notice above the receipts list when a company nears or passes its
 * plan's receipt allowance. Uses the "attention" honey tokens (friendly,
 * not alarming — DESIGN.md): saving receipts is never blocked. The whole
 * row links to Settings so the tap target is full width.
 */
export function UsageNoticeBanner({ notice }: { notice: UsageNotice }) {
  const t = useI18n().t.dashboard.usage;
  return (
    <div
      role="status"
      className="border-b"
      style={{
        background: "var(--attention-tint)",
        borderColor: "color-mix(in srgb, var(--attention) 35%, transparent)",
      }}
    >
      <Link
        href="/app/settings"
        className="max-w-2xl mx-auto px-4 flex items-center gap-3 min-h-[44px] py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
        style={{ color: "var(--attention-deep)", fontSize: "13px", fontWeight: 500 }}
      >
        <Info className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          <NoticeText notice={notice} />
        </span>
        <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t.seeUsage}</span>
      </Link>
    </div>
  );
}

function NoticeText({ notice }: { notice: UsageNotice }) {
  const t = useI18n().t.dashboard.usage;
  if (notice.level === "warn") {
    return (
      <>
        {t.warn(notice.used, notice.allowance, notice.planName)}
        <Money eur={notice.overagePrice} />
        {t.each}
      </>
    );
  }
  return notice.extraCost !== null ? (
    <>
      {t.over(notice.extra, notice.planName, notice.allowance)}
      <Money eur={notice.overagePrice} />
      {t.eachSoFar}
      <Money eur={notice.extraCost} />
      {t.soFar}
    </>
  ) : (
    <>{t.overUnbilled(notice.extra, notice.planName, notice.allowance)}</>
  );
}
