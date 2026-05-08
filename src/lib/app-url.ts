// Build a URL that lives on the product host (app.unreceipt.com).
//
// On the marketing apex (unreceipt.com), CTAs that link to /app/login
// or /subscribe must hard-nav across the host boundary so cookies +
// PKCE auth state land on the right origin. In production this is the
// absolute https://app.unreceipt.com URL; in local dev / Vercel
// previews both surfaces share an origin so a relative path is fine
// (and the absolute URL would break, since app.unreceipt.com isn't
// reachable from localhost).
//
// Resolution rule: read NEXT_PUBLIC_APP_URL — when unset (dev), return
// a relative path; when set (production / staging), prepend it. Doing
// this from a single env var keeps server and client output identical
// so React hydration doesn't flag a mismatch.

export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base || base.length === 0) {
    return path;
  }
  return base.replace(/\/+$/, "") + path;
}
