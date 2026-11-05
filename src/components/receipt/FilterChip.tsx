"use client";

import { cn } from "@/lib/utils";

/**
 * A filter chip per DESIGN.md: a 36px pill inside a 44px tap target, a
 * toggle button (aria-pressed), ink border when active, honey for
 * "Review needed". Shared by the inbox and the firm portal.
 */
export function FilterChip({
  active,
  onClick,
  label,
  count,
  attention = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  attention?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="group flex h-11 shrink-0 items-center rounded-full outline-none"
    >
      <span
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold tracking-[0.02em] whitespace-nowrap transition-colors group-focus-visible:ring-2 group-focus-visible:ring-[var(--ring)]",
          active
            ? attention
              ? "border-[var(--attention)] bg-[var(--attention-tint)] text-[var(--attention-deep)]"
              : "border-[var(--ink)] bg-card text-[var(--ink)]"
            : "border-[var(--hairline)] bg-transparent text-[var(--ink-muted)]",
        )}
      >
        <span>{label}</span>
        <span className="text-[11px] tabular-nums opacity-70">{count}</span>
      </span>
    </button>
  );
}
