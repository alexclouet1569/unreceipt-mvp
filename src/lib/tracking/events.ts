// Funnel events sent to Plausible (demo-funnel strategy, Step 2). Client-safe.
//
// Plausible is loaded only where src/app/_plausible.tsx allows it (the
// marketing site and the public /demo tours). Everywhere else, and whenever
// NEXT_PUBLIC_PLAUSIBLE_DOMAIN is unset or the script is blocked,
// trackEvent() does nothing.
//
// Links are marked with trackedLink() (data attributes, so server components
// can use it too) and handled by one listener, src/app/_funnel-links.tsx.
// Event props are the page's path and language only: never an email, a name
// or anything typed by the visitor.

import type { Locale } from "@/lib/locale";
import { plausibleAllowed, plausibleUrl } from "./where";

export const FUNNEL_EVENTS = [
  "cta_signup",
  "cta_demo_page",
  "demo_tour_start",
  // No caller yet: the demo request form is Step 1 of the strategy.
  "demo_request_sent",
  "demo_tour_finished",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export type EventProps = Record<string, string>;

// The options of Plausible's script.manual.js: `u` is the page URL to report.
type PlausibleFn = (event: string, options?: { u?: string; props?: EventProps }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
  }
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
  if (typeof window === "undefined") return;
  const plausible = window.plausible;
  if (typeof plausible !== "function") return;
  if (!plausibleAllowed(window.location.host, window.location.pathname)) return;
  const u = plausibleUrl(window.location.href);
  if (!u) return;
  try {
    plausible(name, { u, props });
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
