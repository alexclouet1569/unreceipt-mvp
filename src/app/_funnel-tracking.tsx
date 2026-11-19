"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { setEventSender } from "@/lib/tracking/events";
import { handleFunnelClick, type FirstVisit } from "@/lib/tracking/links";
import { cleanPlausiblePayload, plausibleAllowed, plausibleUrl } from "@/lib/tracking/where";
import { applyOptOutFromUrl, withoutOptOutParam, type OptOutChange } from "@/lib/tracking/opt-out";

// Mounted once in the root layout (demo-funnel strategy, Step 2).
//
// 1. Funnel links: one capture-phase listener for clicks on <a data-track>
//    (trackedLink(), src/lib/tracking/events.ts). It adds the visit's source
//    to sign-up links and sends the event. It runs with or without Plausible:
//    the source must reach the sign-up either way.
// 2. Plausible (cookieless, EU-hosted): started only when
//    NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set and plausibleAllowed() says this
//    host and path may use it (the marketing site and the /demo tours).
//    The tracker is Plausible's npm package, bundled and pinned: no script is
//    fetched from plausible.io, because /demo shares its origin with the
//    product's session cookies, which page scripts can read. It only POSTs
//    events to plausible.io. Pageviews are sent here; every request (the
//    tracker's own engagement pings too) goes through transformRequest,
//    which keeps the path and utm_* only.
// 3. "Don't count my visits": ?analytics=off (or =on) on any page sets this
//    browser's flag for this host (src/lib/tracking/opt-out.ts), says so for
//    a few seconds and drops the parameter from the address bar. Plausible's
//    tracker and Vercel's beforeSend both read the flag.

// Where this document was first opened, kept in memory (no storage): the
// demo tours change step without a page load, and the source their sign-up
// link carries is the one their first URL brought from the marketing site.
let firstVisit: FirstVisit | null = null;

// What this document's ?analytics= asked for; undefined until read.
let optOutChange: OptOutChange | null | undefined;

type Tracker = typeof import("@plausible-analytics/tracker");
let tracker: Promise<Tracker | null> | null = null;

function startPlausible(domain: string): Promise<Tracker | null> {
  tracker ??= import("@plausible-analytics/tracker")
    .then((t) => {
      t.init({
        domain,
        autoCapturePageviews: false,
        bindToWindow: false,
        logging: false,
        transformRequest: cleanPlausiblePayload,
      });
      setEventSender((event, options) => t.track(event, options));
      return t;
    })
    .catch(() => null);
  return tracker;
}

const OPT_OUT_NOTICE: Record<OptOutChange, string> = {
  off: "Your visits on this site aren't counted in this browser any more.",
  on: "Your visits on this site are counted again in this browser.",
};

export function FunnelTracking({ plausibleDomain }: { plausibleDomain: string | null }) {
  const pathname = usePathname();
  const [optOutNotice, setOptOutNotice] = useState<OptOutChange | null>(null);

  useEffect(() => {
    // Before the pageview below: an opted-out first visit is never sent.
    // Read once per document (React may run this effect twice in dev).
    if (optOutChange === undefined) {
      optOutChange = applyOptOutFromUrl(window.location.href);
      const clean = withoutOptOutParam(window.location.href);
      if (clean) window.history.replaceState(window.history.state, "", clean);
    }
    const change = optOutChange;
    if (!change) return;
    // Shown after this paint (setState outside the effect body), hidden after 8 s.
    const show = window.setTimeout(() => setOptOutNotice(change), 0);
    const hide = window.setTimeout(() => {
      optOutChange = null;
      setOptOutNotice(null);
    }, 8000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);

  useEffect(() => {
    if (!firstVisit) firstVisit = { href: window.location.href, referrer: document.referrer };
    const visit = firstVisit;
    const onClick = (event: MouseEvent) => {
      // Left and middle clicks; a right click only opens the menu.
      if (event.type === "auxclick" && event.button !== 1) return;
      handleFunnelClick(event, visit, window.location.pathname);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!plausibleDomain) return;
    if (!plausibleAllowed(window.location.host, window.location.pathname)) return;
    const url = plausibleUrl(window.location.href);
    if (!url) return;
    void startPlausible(plausibleDomain).then((t) => {
      // Still on an allowed page once the tracker has loaded.
      if (t && plausibleAllowed(window.location.host, window.location.pathname)) t.track("pageview", { url });
    });
  }, [plausibleDomain, pathname]);

  if (!optOutNotice) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border border-hairline bg-card px-4 py-3 text-center text-sm text-foreground"
    >
      {OPT_OUT_NOTICE[optOutNotice]}
    </div>
  );
}
