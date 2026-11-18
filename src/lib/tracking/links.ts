// The click handler behind trackedLink() (src/lib/tracking/events.ts),
// installed once by src/app/_funnel-tracking.tsx. Client-safe.
//
// On a click (or middle-click) of an <a data-track>, before the browser
// follows it: with data-attribution, the link's href gets the visit's source
// (src/lib/attribution.ts); then the event is sent. The rewrite happens at
// click time so server-rendered pages keep plain, cacheable links.

import { attributionFrom, withAttribution } from "@/lib/attribution";
import { isFunnelEvent, pageProps, trackEvent } from "./events";

/** Where this document was first opened: its URL and referrer. */
export type FirstVisit = { href: string; referrer: string };

export function handleFunnelClick(event: Event, first: FirstVisit, pathname: string): void {
  // Another handler kept the browser from following the link (the demo
  // tours' guard): nothing was clicked through.
  if (event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest("a[data-track]");
  if (!(link instanceof HTMLAnchorElement)) return;

  if (link.hasAttribute("data-attribution")) {
    const source = attributionFrom(first.href, first.referrer);
    const raw = link.getAttribute("href");
    if (raw && source) link.setAttribute("href", withAttribution(raw, source));
  }

  const name = link.getAttribute("data-track");
  if (isFunnelEvent(name)) trackEvent(name, pageProps(pathname));
}
