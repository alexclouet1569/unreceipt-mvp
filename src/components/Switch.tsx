"use client";

import { cn } from "@/lib/utils";

/**
 * The product's on/off switch (DESIGN.md): ink when on, --ink-muted when
 * off, so a screen's primary action stays its one green. 44px tall tap
 * target. `busy` keeps focus on the switch (aria-disabled, not disabled)
 * and ignores presses while a save is running.
 */
export function Switch({
  checked,
  onClick,
  labelledBy,
  describedBy,
  busy = false,
}: {
  checked: boolean;
  onClick: () => void;
  labelledBy: string;
  describedBy?: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onClick();
      }}
      className="flex size-11 w-14 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:opacity-60"
    >
      <span
        className={cn(
          "flex h-[26px] w-11 items-center rounded-full p-[3px] transition-colors duration-100",
          checked ? "bg-[var(--ink)]" : "bg-[var(--ink-muted)]",
        )}
      >
        <span
          className={cn(
            "size-5 rounded-full bg-card transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            checked ? "translate-x-[18px]" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
