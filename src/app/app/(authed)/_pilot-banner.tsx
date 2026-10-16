"use client";

import { useState, useSyncExternalStore } from "react";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "unreceipt:pilot-banner-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// localStorage has no change event within the same tab; the in-memory
// `dismissedNow` state covers a dismissal made on this page.
const noSubscribe = () => () => {};

/**
 * Shown on /app when PILOT_MODE=true. The Stripe subscription gate is
 * bypassed during the pilot; this banner tells the user what's going
 * on and sets expectations for the eventual transition to paid.
 *
 * Dismissal persists in localStorage — the founder doesn't want a
 * recurring banner once a pilot user has acknowledged it.
 */
export function PilotBanner() {
  // Server snapshot is "dismissed" so SSR renders nothing and the banner
  // only appears after hydration for users who haven't closed it.
  const dismissedEarlier = useSyncExternalStore(noSubscribe, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);

  if (dismissedEarlier || dismissedNow) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage can throw in private mode / quota — silent fallback
      // to in-memory dismissal so the user still gets the X to close it.
    }
    setDismissedNow(true);
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 flex-1">
          You&apos;re using the UnReceipt free pilot. When we open paid access
          in the coming weeks, we&apos;ll send you a heads-up. Until then,
          everything is free, with no receipt limit.
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
