// Where Plausible may load (demo-funnel strategy, Step 2). Client-safe.
//
// - The marketing apex (unreceipt.com): every page.
// - The product host (app.unreceipt.com): only the public demo tours
//   (/demo, /demo/*), which show sample data and carry no token (founder
//   decision 2026-11-17). Never /app, /firm, /admin, /auth or /subscribe.
// - Local and preview addresses, which serve both: the marketing pages and
//   the demo only, so app screens tested on a preview send nothing.

import { MARKETING_PATHS } from "@/lib/marketing-pages";

const APEX = "unreceipt.com";
const APP = "app.unreceipt.com";

function isDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

function isMarketingPath(pathname: string): boolean {
  return pathname === "/privacy" || MARKETING_PATHS.includes(pathname);
}

export function isSharedHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h.startsWith("localhost:") || h.startsWith("127.0.0.1") || h.endsWith(".vercel.app");
}

/** True when Plausible may run on this host and path. */
export function plausibleAllowed(host: string, pathname: string): boolean {
  const h = host.toLowerCase();
  if (h === APEX || h === `www.${APEX}`) return true;
  if (h === APP) return isDemoPath(pathname);
  if (isSharedHost(h)) return isMarketingPath(pathname) || isDemoPath(pathname);
  return false;
}

/**
 * The URL Plausible is given for a pageview or event: origin and path, plus
 * the campaign tags (utm_*) Plausible reads its sources from. Every other
 * query param (?step=, a code, a token) and the hash are dropped, so nothing
 * but the page's address leaves the browser. Null for an unreadable URL.
 */
export function plausibleUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (/^utm_(source|medium|campaign|term|content)$/.test(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
}

/**
 * Plausible's transformRequest: every request the tracker sends (pageviews,
 * events, its own engagement pings) reports plausibleUrl(), or is dropped
 * when the URL can't be read.
 */
export function cleanPlausiblePayload<P extends { u: string }>(payload: P): P | null {
  const url = plausibleUrl(payload.u);
  return url ? { ...payload, u: url } : null;
}
