"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setEventSender } from "@/lib/tracking/events";
import { handleFunnelClick, type FirstVisit } from "@/lib/tracking/links";
import { cleanPlausiblePayload, plausibleAllowed, plausibleUrl } from "@/lib/tracking/where";

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

// Where this document was first opened, kept in memory (no storage): the
// demo tours change step without a page load, and the source their sign-up
// link carries is the one their first URL brought from the marketing site.
let firstVisit: FirstVisit | null = null;

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

export function FunnelTracking({ plausibleDomain }: { plausibleDomain: string | null }) {
  const pathname = usePathname();

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

  return null;
}
