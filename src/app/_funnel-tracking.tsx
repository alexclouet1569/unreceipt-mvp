"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { handleFunnelClick, type FirstVisit } from "@/lib/tracking/links";
import { plausibleAllowed, plausibleUrl } from "@/lib/tracking/where";

// Mounted once in the root layout (demo-funnel strategy, Step 2).
//
// 1. Funnel links: one capture-phase listener for clicks on <a data-track>
//    (trackedLink(), src/lib/tracking/events.ts). It adds the visit's source
//    to sign-up links and sends the event. It runs with or without Plausible:
//    the source must reach the sign-up either way.
// 2. Plausible (cookieless, EU-hosted): loaded only when
//    NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set and plausibleAllowed() says this
//    host and path may use it (the marketing site and the /demo tours).
//    script.manual.js sends nothing by itself; each pageview is sent here
//    with plausibleUrl(), so no query param but utm_* ever leaves the page.

const PLAUSIBLE_SRC = "https://plausible.io/js/script.manual.js";
const SCRIPT_ID = "plausible-script";

// Where this document was first opened, kept in memory (no storage): the
// demo tours change step without a page load, and the source their sign-up
// link carries is the one their first URL brought from the marketing site.
let firstVisit: FirstVisit | null = null;

function loadPlausible(domain: string): void {
  if (!window.plausible) {
    const queue: unknown[] = [];
    const stub = (...args: unknown[]) => {
      queue.push(args);
    };
    window.plausible = Object.assign(stub, { q: queue });
  }
  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.defer = true;
  script.src = PLAUSIBLE_SRC;
  script.setAttribute("data-domain", domain);
  document.head.appendChild(script);
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
    loadPlausible(plausibleDomain);
    const u = plausibleUrl(window.location.href);
    if (u) window.plausible?.("pageview", { u });
  }, [plausibleDomain, pathname]);

  return null;
}
