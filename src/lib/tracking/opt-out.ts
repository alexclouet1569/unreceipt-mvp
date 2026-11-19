// "Don't count my visits" for one browser (2026-11-19). Client-safe.
//
// Open any page with ?analytics=off and this browser stops sending visits to
// Vercel Web Analytics and Plausible; ?analytics=on counts it again. The
// founder uses it so the numbers show other people; any visitor may too.
//
// The flag is Plausible's own (`localStorage.plausible_ignore = "true"`),
// which its npm tracker already honours for pageviews, events and engagement
// pings; Vercel's `beforeSend` (src/app/_vercel-analytics.tsx) checks the
// same flag. localStorage is per origin, so it is set once on unreceipt.com
// and once on app.unreceipt.com, in each browser. Nothing is stored unless
// someone asks for it (privacy page, "Cookies").

export const OPT_OUT_KEY = "plausible_ignore";
export const OPT_OUT_PARAM = "analytics";

export type OptOutChange = "off" | "on";

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): FlagStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Blocked storage (some private modes) throws on access.
    return null;
  }
}

/** What ?analytics= in this URL asks for, if anything. */
export function optOutRequested(href: string): OptOutChange | null {
  let value: string | null;
  try {
    value = new URL(href).searchParams.get(OPT_OUT_PARAM);
  } catch {
    return null;
  }
  const v = value?.trim().toLowerCase();
  return v === "off" || v === "on" ? v : null;
}

/** Applies ?analytics=off|on from the URL. Returns the change, or null when the URL asks for none. */
export function applyOptOutFromUrl(href: string, storage: FlagStorage | null = browserStorage()): OptOutChange | null {
  const change = optOutRequested(href);
  if (!change || !storage) return null;
  try {
    if (change === "off") storage.setItem(OPT_OUT_KEY, "true");
    else storage.removeItem(OPT_OUT_KEY);
  } catch {
    return null;
  }
  return change;
}

/** True when this browser asked not to be counted. */
export function isOptedOut(storage: FlagStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(OPT_OUT_KEY) === "true";
  } catch {
    return false;
  }
}

/** The same address without ?analytics=, for history.replaceState. */
export function withoutOptOutParam(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!url.searchParams.has(OPT_OUT_PARAM)) return null;
  url.searchParams.delete(OPT_OUT_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Vercel Web Analytics' `beforeSend`: honours ?analytics= in the page's URL
 * first (the pageview can be sent before any effect runs), then drops every
 * event from an opted-out browser.
 */
export function skipOptedOut<E extends { url: string }>(event: E, storage: FlagStorage | null = browserStorage()): E | null {
  applyOptOutFromUrl(event.url, storage);
  return isOptedOut(storage) ? null : event;
}
