"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "unreceipt:pilot-banner-dismissed";

/**
 * Shown on /app when PILOT_MODE=true. The Stripe subscription gate is
 * bypassed during the pilot; this banner tells the user what's going
 * on and sets expectations for the eventual transition to paid.
 *
 * Dismissal persists in localStorage — the founder doesn't want a
 * recurring banner once a pilot user has acknowledged it.
 */
export function PilotBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage can throw in private mode / quota — silent fallback
      // to in-memory dismissal so the user still gets the X to close it.
    }
    setHidden(true);
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 flex-1">
          You&apos;re using the UnReceipt free pilot. When we open paid access
          in the coming weeks, we&apos;ll send you a heads-up. Until then,
          every receipt you forward gets concierge processing within 24 hours.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="text-amber-700 hover:text-amber-900 p-0.5 -m-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
