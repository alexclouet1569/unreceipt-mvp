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
export function PilotBanner({ inStoreApp = false }: { inStoreApp?: boolean }) {
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
    <div className="bg-[var(--brand-tint)] border-b border-[var(--hairline)]">
      <div className="max-w-[540px] mx-auto px-4 py-1 flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-[var(--ink-muted)] shrink-0" aria-hidden="true" />
        <p className="text-[13px] leading-[1.45] text-[var(--ink)] flex-1 py-1.5">
          {/* The store apps never mention paid access (App Store 3.1.3(f),
              src/lib/native-app.ts). */}
          {inStoreApp ? (
            <>
              You&apos;re using the UnReceipt free pilot. Every receipt you
              forward gets concierge processing within 24 hours.
            </>
          ) : (
            <>
              You&apos;re using the UnReceipt free pilot. When we open paid access
              in the coming weeks, we&apos;ll send you a heads-up. Until then,
              every receipt you forward gets concierge processing within 24 hours.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center justify-center w-11 h-11 -mr-3 shrink-0 rounded-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label="Dismiss pilot notice"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
