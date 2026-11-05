"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExportPanel } from "@/components/ExportPanel";
import { monthLabel } from "@/lib/firm/client-stats";

/**
 * "Export this month" for one client: the ZIP with bookkeeping.csv. Default
 * is only what hasn't been exported yet (and stamping it); the switch
 * re-exports the whole month without touching the stamps.
 */
export function ExportMonthPanel({
  organizationId,
  month,
  unexportedCount,
  reviewCount,
}: {
  organizationId: string;
  month: string;
  unexportedCount: number;
  reviewCount: number;
}) {
  const router = useRouter();
  const [onlyNew, setOnlyNew] = useState(true);
  const id = `export-only-new-${organizationId}`;

  return (
    <section
      aria-label="Export"
      className="bg-card space-y-3"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
            Export {monthLabel(month)}
          </p>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
            {onlyNew
              ? `${unexportedCount} ready receipt${unexportedCount === 1 ? "" : "s"} not exported yet.`
              : "Every receipt of the month, exported ones included; stamps are left as they are."}
            {reviewCount > 0
              ? ` ${reviewCount} still need${reviewCount === 1 ? "s" : ""} review and get no PDF until completed.`
              : ""}
          </p>
        </div>
        <label htmlFor={id} className="inline-flex items-center gap-2 text-[var(--ink)]" style={{ fontSize: "14px", minHeight: "44px" }}>
          <input
            id={id}
            type="checkbox"
            className="size-4"
            checked={onlyNew}
            onChange={(e) => setOnlyNew(e.target.checked)}
          />
          Only receipts not yet exported
        </label>
      </div>
      <ExportPanel
        key={`${month}-${onlyNew}`}
        fixedPeriod={month}
        endpoint={`/api/firm/clients/${organizationId}/export`}
        extraBody={{ unexportedOnly: onlyNew, markExported: onlyNew }}
        buttonLabel="Create export (ZIP with bookkeeping.csv)"
        onDone={() => router.refresh()}
      />
    </section>
  );
}
