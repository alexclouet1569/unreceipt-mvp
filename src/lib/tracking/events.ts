// Funnel events sent to Plausible (demo-funnel strategy, Step 2). Client-safe.
//
// Plausible's tracker is bundled from npm (@plausible-analytics/tracker,
// pinned) and started by src/app/_funnel-tracking.tsx only where
// plausibleAllowed() says so (the marketing site and the public /demo tours):
// no script is loaded from plausible.io, so nothing remote runs on our
// origins, where the product's session cookies live. Until it is started,
// and whenever NEXT_PUBLIC_PLAUSIBLE_DOMAIN is unset, trackEvent() does
// nothing.
//
// Links are marked with trackedLink() (data attributes, so server components
// can use it too) and handled by one listener in src/app/_funnel-tracking.tsx.
// Event props are the page's path and language only: never an email, a name
// or anything typed by the visitor.

import type { Locale } from "@/lib/locale";
import { plausibleAllowed, plausibleUrl } from "./where";

export const FUNNEL_EVENTS = [
  "cta_signup",
  "cta_demo_page",
  "demo_tour_start",
  // Sent by the demo request form once the request is saved.
  "demo_request_sent",
  "demo_tour_finished",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export type EventProps = Record<string, string>;

/** Plausible's `track()`, once the tracker has been started (setEventSender()). */
export type EventSender = (event: string, options: { url: string; props: EventProps }) => void;

let sender: EventSender | null = null;

/** Called by the loader once Plausible's tracker is initialised; null stops sending. */
export function setEventSender(next: EventSender | null): void {
  sender = next;
}

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return typeof value === "string" && (FUNNEL_EVENTS as readonly string[]).includes(value);
}

/** The marketing language of a path: /sv… and /fr… are Swedish and French. */
export function localeOfPath(pathname: string): Locale {
  if (pathname === "/sv" || pathname.startsWith("/sv/")) return "sv";
  if (pathname === "/fr" || pathname.startsWith("/fr/")) return "fr";
  return "en";
}

/**
 * Sends one event when Plausible is on the page and allowed on this path;
 * otherwise nothing. The page is reported as plausibleUrl() (no query but
 * utm_*). Never throws.
 */
export function trackEvent(name: FunnelEvent, props: EventProps = {}): void {
  if (typeof window === "undefined" || !sender) return;
  if (!plausibleAllowed(window.location.host, window.location.pathname)) return;
  const url = plausibleUrl(window.location.href);
  if (!url) return;
  try {
    sender(name, { url, props });
  } catch {
    // Analytics must never break a click.
  }
}

/** The props every funnel event carries: the page's path and its language. */
export function pageProps(pathname: string): EventProps {
  return { page: pathname, locale: localeOfPath(pathname) };
}

export type TrackedLinkAttrs = {
  "data-track": FunnelEvent;
  "data-attribution"?: "";
};

/**
 * Attributes for a link that sends `event` when clicked and, with
 * `attribution`, carries the visit's source (src/lib/attribution.ts) to the
 * page it opens. Spread them on an <a>: `<a href=… {...trackedLink("cta_signup", { attribution: true })}>`.
 */
export function trackedLink(event: FunnelEvent, opts: { attribution?: boolean } = {}): TrackedLinkAttrs {
  return opts.attribution ? { "data-track": event, "data-attribution": "" } : { "data-track": event };
}
