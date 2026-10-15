import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import type { UsageNotice } from "@/lib/usage-copy";
import { Money } from "@/components/Money";

/**
 * Thin notice above the receipts list when a company nears or passes its
 * plan's receipt allowance. Uses the "attention" honey tokens (friendly,
 * not alarming — DESIGN.md): saving receipts is never blocked. The whole
 * row links to Settings so the tap target is full width.
 */
export function UsageNoticeBanner({ notice }: { notice: UsageNotice }) {
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
        <span className="sr-only">See usage in settings</span>
      </Link>
    </div>
  );
}

function NoticeText({ notice }: { notice: UsageNotice }) {
  if (notice.level === "warn") {
    return (
      <>
        You&apos;ve used {notice.used} of the {notice.allowance} receipts in your{" "}
        {notice.planName} plan this period. Extra receipts are{" "}
        <Money eur={notice.overagePrice} /> each.
      </>
    );
  }
  const receipts = `${notice.extra} receipt${notice.extra === 1 ? "" : "s"}`;
  return notice.extraCost !== null ? (
    <>
      You&apos;re {receipts} over your {notice.planName} plan ({notice.allowance} a
      month). Extra receipts are <Money eur={notice.overagePrice} /> each —{" "}
      <Money eur={notice.extraCost} /> so far, on your next invoice.
    </>
  ) : (
    <>
      You&apos;re {receipts} over your {notice.planName} plan ({notice.allowance} a
      month). Everything is still saved.
    </>
  );
}
