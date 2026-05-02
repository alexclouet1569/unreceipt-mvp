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
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 flex-1">
          We&apos;re having trouble verifying your account status right now.
          You can keep using the dashboard — if you see anything off, email{" "}
          <a
            href="mailto:support@unreceipt.io"
            className="font-medium underline underline-offset-2"
          >
            support@unreceipt.io
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-amber-700 hover:text-amber-900 p-0.5 -m-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
