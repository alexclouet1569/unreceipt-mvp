"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Critical-gap fix #2: shown when the subscriptions query fails
 * (Supabase blip, network error). We fail-OPEN — the dashboard still
 * renders so a paying customer isn't blocked over a transient issue —
 * but we tell them something is up so confused support tickets become
 * informed support tickets.
 */
export function DbWarningBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-[var(--attention-tint)] border-b border-[var(--attention)]">
      <div className="max-w-[540px] mx-auto px-4 py-2 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-[var(--attention-deep)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--attention-deep)] flex-1">
          We&apos;re having trouble verifying your account status right now.
          You can keep using the dashboard — if you see anything off, email{" "}
          <a
            href="mailto:support@unreceipt.com"
            className="font-medium underline underline-offset-2"
          >
            support@unreceipt.com
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[var(--attention-deep)] hover:opacity-80 p-0.5 -m-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
