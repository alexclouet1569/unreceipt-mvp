// What Vercel Web Analytics and Speed Insights may see of a page's URL
// (their `beforeSend`, src/app/_vercel-analytics.tsx). Client-safe, pure.
//
// The product host carries secrets in URLs: invite tokens
// (/app/accountant/accept?token=…, /app/firm-request?token=…), a firm's join
// code in the path (/app/connect/<code>), sign-in codes and, with Supabase's
// implicit flow, tokens in the hash (#access_token=…). So:
// - the marketing apex keeps its path and only the campaign tags (utm_*);
// - every other host (the product, previews, localhost) keeps the path only,
//   with no query and no hash;
// - path segments that are secrets or identify someone become placeholders:
//   /app/connect/[code], /admin/[userId], /firm/clients/[orgId].

const APEX_HOSTS = new Set(["unreceipt.com", "www.unreceipt.com"]);

const PATH_PLACEHOLDERS: ReadonlyArray<[RegExp, string]> = [
  [/^\/app\/connect\/[^/]+/, "/app/connect/[code]"],
  [/^\/admin\/(?!pilot(?:\/|$))[^/]+/, "/admin/[userId]"],
  [/^\/firm\/clients\/[^/]+/, "/firm/clients/[orgId]"],
];

export function scrubPath(pathname: string): string {
  for (const [re, placeholder] of PATH_PLACEHOLDERS) {
    if (re.test(pathname)) return pathname.replace(re, placeholder);
  }
  return pathname;
}

/** The URL to report, or null when it can't be read (the event is then dropped). */
export function scrubAnalyticsUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const path = scrubPath(url.pathname);
  if (!APEX_HOSTS.has(url.hostname.toLowerCase())) return `${url.origin}${path}`;
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (/^utm_(source|medium|campaign|term|content)$/.test(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return `${url.origin}${path}${query ? `?${query}` : ""}`;
}

/** A `beforeSend` for both Vercel scripts: same event, scrubbed URL; dropped when unreadable. */
export function scrubAnalyticsEvent<E extends { url: string }>(event: E): E | null {
  const url = scrubAnalyticsUrl(event.url);
  return url ? { ...event, url } : null;
}
