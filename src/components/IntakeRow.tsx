"use client";

// A labelled, copyable intake address (the user's forwarding email, or the
// SMS number). Used on the empty state and on /app/settings. The value
// renders in mono per DESIGN.md's empty-state spec.

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function IntakeRow({
  callout,
  value,
  mono,
  copyLabel,
}: {
  callout: string;
  value: string;
  mono: boolean;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* secure-context fallback: user can long-press to select */
    }
  }, [value]);

  return (
    <div className="text-left">
      <p
        className="font-accent italic text-[var(--ink-muted)]"
        style={{ fontSize: "12px", marginBottom: "6px" }}
      >
        {callout}
      </p>
      <div
        className="flex items-center gap-3 bg-card"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: "12px",
          padding: "12px 14px",
        }}
      >
        <span
          className={cn(
            "flex-1 min-w-0 text-[var(--ink)] break-all",
            mono ? "font-mono" : "",
          )}
          style={{ fontSize: "14px", fontWeight: 500 }}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 inline-flex items-center gap-1.5 text-white"
          style={{
            background: copied
              ? "var(--brand-action-deep)"
              : "var(--primary)",
            padding: "6px 12px",
            minHeight: "44px",
            borderRadius: "9px",
            fontSize: "13px",
            fontWeight: 600,
            transition: "background 160ms ease-out",
          }}
          aria-label={copyLabel}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
