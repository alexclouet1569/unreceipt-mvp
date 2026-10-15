import Link from "next/link";
import { Info } from "lucide-react";
import type { UsageNotice } from "@/lib/usage-copy";

/**
 * Thin notice above the receipts list when a company nears or passes its
 * plan's receipt allowance. Uses the "attention" honey tokens (friendly,
 * not alarming): saving receipts is never blocked.
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
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-start gap-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--attention-deep)" }} />
        <p className="text-xs flex-1" style={{ color: "var(--attention-deep)" }}>
          {notice.message}{" "}
          <Link href="/app/settings" className="underline underline-offset-2 font-semibold">
            See usage
          </Link>
        </p>
      </div>
    </div>
  );
}
