// Host split, admin gate and session refresh, called from `src/proxy.ts`.
//
// This file is NOT a Next.js convention file. Next 16 looks for `proxy.ts`
// only next to the `app` directory (here `src/`), so when this logic lived
// in a repo-root `proxy.ts` it was compiled but never ran (found
// 2026-11-16). `src/proxy.ts` is the one proxy; it calls `proxy()` below
// and carries the matcher, which Next reads statically from that file.
//
// Three responsibilities:
//   1. Host-based routing — keep marketing on the apex
//      (unreceipt.com) and product on the app subdomain
//      (app.unreceipt.com). Cross-host visits 308-redirect to the
//      right host. PR #15 already sends www.* → apex via
//      next.config.ts redirects() — that runs before this proxy.
//   2. Optimistic admin gate for /admin/** and /api/admin/**.
//      requireAdmin() inside each admin server action / route handler
//      is the real authorization (plan decision A2 — defense in depth);
//      the proxy keeps non-admins from even reaching those routes.
//   3. Supabase session refresh on every non-static request outside the
//      apex (below).
//
// Local dev (host = localhost / 127.* / a vercel.app preview) is
// neither apex nor app, so the host-routing redirects no-op and both
// surfaces remain reachable on the same host.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { ADMIN_MFA_PATH, hasSecondFactor, isAdminEmail } from "@/lib/auth-admin";
import { INDEXNOW_KEY } from "@/lib/indexnow";
import { MARKETING_PATHS, demoRequestPath } from "@/lib/marketing-pages";

const APEX_HOSTS = new Set(["unreceipt.com", "www.unreceipt.com"]);
const APP_HOST = "app.unreceipt.com";

// Paths that belong on the marketing host. Anything not in either
// list is "neutral" (e.g. /api/health if we ever add one) and stays
// wherever the request landed. Every marketing page (landing pages,
// audience pages, guides) comes from MARKETING_PAGES.
const APEX_ONLY_EXACT = new Set([...MARKETING_PATHS, "/privacy"]);
const APEX_ONLY_PREFIX = ["/api/waitlist", "/api/demo-request"];

// Paths that belong on the product host: checkout, auth callback, admin and
// the firm portal, so signups, payments, magic links and operator tools all
// originate from one cookie origin.
//
// /api/webhooks is deliberately NOT here: Stripe treats a 3xx as a failed
// delivery and never follows it, so a webhook endpoint registered on the
// apex would silently stop receiving events. The route checks Stripe's
// signature, which is its protection on either host.
const APP_ONLY_PREFIX = [
  "/app",
  "/admin",
  "/firm",
  "/api/firm",
  "/demo",
  "/auth",
  "/subscribe",
  "/api/checkout",
  "/api/billing",
  "/api/admin",
];

function isApexOnly(path: string): boolean {
  if (APEX_ONLY_EXACT.has(path)) return true;
  return APEX_ONLY_PREFIX.some((p) => path === p || path.startsWith(p));
}

function isAppOnly(path: string): boolean {
  return APP_ONLY_PREFIX.some(
    (p) => path === p || path.startsWith(p + "/")
  );
}

// Static-asset bailout — these are served the same way on both hosts
// and we don't want to incur any work for them. Covers Next internals
// plus the PWA-adjacent files (manifest.json, sw.js) and the explicit
// static endpoints. Extension check catches anything else (.png/.svg/
// .woff2/etc).
const STATIC_PATHS = new Set([
  "/favicon.ico",
  "/manifest.json",
  "/sw.js",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/opengraph-image",
  `/${INDEXNOW_KEY}.txt`,
]);
const STATIC_EXT_RE = /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|css|js|map)$/i;

function isStaticAsset(path: string): boolean {
  if (path.startsWith("/_next") || path.startsWith("/icons")) return true;
  // Share images of the marketing pages, drawn at build time.
  if (path.startsWith("/og/")) return true;
  // Public, CDN-cached store logos: no session to refresh, and a list of
  // receipts would otherwise cost one auth round-trip per logo.
  if (path.startsWith("/api/merchant-logo/")) return true;
  if (STATIC_PATHS.has(path)) return true;
  return STATIC_EXT_RE.test(path);
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isStaticAsset(path)) {
    return NextResponse.next();
  }

  const host = (request.headers.get("host") ?? "").toLowerCase();
  const onApex = APEX_HOSTS.has(host);
  const onApp = host === APP_HOST;

  // Product surface reached on the marketing host → 308 to the same path on
  // the app host, preserving the query string. This runs FIRST — before the
  // session-refresh block and before the admin gate — because refreshing here
  // would only mint cookies scoped to the apex origin we're leaving, so it is
  // wasted work on a request that just bounces to another host. Keeping it a
  // plain, cheap redirect avoids that. 308 also preserves method + body.
  if (onApex && (path === "/app" || path.startsWith("/app/"))) {
    return NextResponse.redirect(
      new URL(path + request.nextUrl.search, `https://${APP_HOST}`),
      308
    );
  }

  // The product host's root opens the product, not the marketing page (a
  // person typing app.unreceipt.com wants their receipts). 307, not 308:
  // browsers cache a permanent redirect indefinitely, and this one may
  // change. Runs before the refresh because /app's own request refreshes.
  if (onApp && path === "/") {
    return NextResponse.redirect(
      new URL("/app" + request.nextUrl.search, `https://${APP_HOST}`),
      307
    );
  }

  // The interactive demo tour (/demo, /demo/*) is closed to the public
  // (founder decision 2026-11-18: visitors book a demo and leave their
  // email instead). Everyone is sent to the demo request page in their
  // browser's language: 307, because the tour may come back. Local dev
  // keeps it, because docs/onboarding/scripts/capture.mjs takes the guides'
  // screenshots from it.
  if ((path === "/demo" || path.startsWith("/demo/")) && !isLocalDev(host)) {
    const target = demoRequestPath(demoLocaleFor(request.headers.get("accept-language")));
    const origin = onApex || onApp ? `https://${[...APEX_HOSTS][0]}` : request.nextUrl.origin;
    return NextResponse.redirect(new URL(target, origin), 307);
  }

  // ─── BEGIN session refresh (TEMPORARY — remove this block as one unit) ───
  // Official Supabase + Next.js App Router pattern: read the auth cookies
  // off the request, call getUser() (which silently rotates an expiring
  // access token using the refresh token), write the new cookies onto the
  // REQUEST as well (so the page, layout or route handler behind this
  // proxy reads the rotated session instead of refreshing again with the
  // refresh token that was just used up), and replay them as Set-Cookie on
  // whatever response we ultimately return. This runs BEFORE the
  // host-routing and admin logic below but deliberately does NOT
  // short-circuit them — it is refresh-only and adds no redirect or gate,
  // so it cannot change who can reach what.
  //
  // Skipped for /admin + /api/admin: adminGate() already runs getUser() and
  // forwards refreshed cookies the same way, so refreshing here too would
  // be a redundant second token rotation on the same request.
  //
  // Skipped on the apex (unreceipt.com) too: nobody signs in there (/app,
  // /auth and every other product path leave for the app host), so a
  // refresh only costs a Supabase round-trip, and the no-cache headers it
  // adds when it rotates a cookie would stop the prerendered marketing
  // pages from being cached. Local dev and previews serve the product from
  // the same origin, so they keep refreshing on every path.
  const isAdminPath =
    path.startsWith("/admin") || path.startsWith("/api/admin");
  const refreshed =
    isAdminPath || onApex ? NO_REFRESH : await refreshSession(request);
  const withRefreshedCookies = (res: NextResponse): NextResponse =>
    applyRefresh(res, refreshed);
  // ─── END session refresh ───

  // Cross-host redirects for the remaining app-only paths (/admin, /auth,
  // /subscribe, /api/checkout, /api/billing, /api/admin, /firm, /demo);
  // /app is already handled above. 308 preserves method + body for clients
  // that follow it (browsers do; Stripe doesn't, see APP_ONLY_PREFIX).
  if (onApex && isAppOnly(path)) {
    return withRefreshedCookies(
      NextResponse.redirect(
        new URL(path + request.nextUrl.search, `https://${APP_HOST}`),
        308
      )
    );
  }
  if (onApp && isApexOnly(path)) {
    return withRefreshedCookies(
      NextResponse.redirect(
        new URL(path + request.nextUrl.search, "https://unreceipt.com"),
        308
      )
    );
  }

  // Admin allowlist — runs on whichever host we ended up on. After the
  // split this is effectively only the app host; before / during DNS
  // propagation it also protects apex.
  if (isAdminPath) {
    return adminGate(request);
  }

  return withRefreshedCookies(nextWithRequest(request, refreshed));
}

type RefreshedCookie = { name: string; value: string; options: CookieOptions };
type Refresh = {
  cookies: RefreshedCookie[];
  // Cache-Control / Expires / Pragma that @supabase/ssr asks for whenever
  // it sets auth cookies, so no CDN caches one user's session for another.
  headers: Record<string, string>;
};
const NO_REFRESH: Refresh = { cookies: [], headers: {} };

// Pass-through response. When the session was rotated, the request's
// cookie header (already updated by setRequestCookies) is forwarded
// upstream, so server components see the new tokens.
function nextWithRequest(request: NextRequest, refresh: Refresh): NextResponse {
  return refresh.cookies.length > 0
    ? NextResponse.next({ request })
    : NextResponse.next();
}

function applyRefresh(res: NextResponse, refresh: Refresh): NextResponse {
  for (const { name, value, options } of refresh.cookies) {
    res.cookies.set({ name, value, ...options });
  }
  for (const [key, value] of Object.entries(refresh.headers)) {
    res.headers.set(key, value);
  }
  return res;
}

// Writes rotated auth cookies onto the incoming request (a removal arrives
// as an empty value with maxAge 0 and is deleted there).
function setRequestCookies(request: NextRequest, cookies: RefreshedCookie[]) {
  for (const { name, value, options } of cookies) {
    if (value === "" || options?.maxAge === 0) request.cookies.delete(name);
    else request.cookies.set(name, value);
  }
}

// TEMPORARY helper for the session-refresh block in proxy() above — remove
// alongside it. Builds a request-scoped Supabase client, refreshes the
// session via getUser(), writes the rotated cookies onto the request and
// returns them (with the SDK's no-cache headers) so the caller can replay
// them onto the outgoing response. Returns NO_REFRESH when the env is
// unconfigured; never throws.
async function refreshSession(request: NextRequest): Promise<Refresh> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NO_REFRESH;

  const refresh: Refresh = { cookies: [], headers: {} };
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        setRequestCookies(request, toSet);
        refresh.cookies.push(...toSet);
        Object.assign(refresh.headers, headers ?? {});
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch (err) {
    // Refresh-only: a Supabase outage must not take every page down. The
    // page's own getServerUser() decides what the visitor may see.
    console.error("[proxy] session refresh failed", err instanceof Error ? err.message : "unknown");
  }
  return refresh;
}

async function adminGate(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isApiPath = request.nextUrl.pathname.startsWith("/api/admin");

  if (!supabaseUrl || !supabaseAnon) {
    return forbid(request, isApiPath);
  }

  const refresh: Refresh = { cookies: [], headers: {} };
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        setRequestCookies(request, toSet);
        refresh.cookies.push(...toSet);
        Object.assign(refresh.headers, headers ?? {});
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return forbid(request, isApiPath);
  }

  // A second sign-in step (TOTP, `aal2`) is required everywhere except the
  // page where the admin sets it up or enters the code. requireAdmin()
  // checks the same thing behind this; this check only saves the round trip.
  if (request.nextUrl.pathname !== ADMIN_MFA_PATH) {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !hasSecondFactor(data?.claims as Record<string, unknown> | undefined)) {
      const res = isApiPath
        ? NextResponse.json({ error: "mfa_required" }, { status: 403 })
        : NextResponse.redirect(new URL(ADMIN_MFA_PATH, request.url));
      return applyRefresh(res, refresh);
    }
  }

  // requireAdmin() behind this reads the rotated session from the request.
  return applyRefresh(nextWithRequest(request, refresh), refresh);
}

function forbid(request: NextRequest, isApiPath: boolean) {
  if (isApiPath) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/app", request.url));
}

// The paths this proxy is meant to see: everything except Next internals
// (the static-asset check above filters the rest). Next only reads a matcher
// written literally in `src/proxy.ts`, so that file repeats this string; a
// test keeps the two equal.
export const HOST_PROXY_MATCHER = "/((?!_next/static|_next/image|favicon.ico).*)";

/** localhost and 127.* (not previews, which anyone with the link can open). */
function isLocalDev(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.");
}

/** The demo request page's language for a browser: Swedish, French, else English. */
export function demoLocaleFor(acceptLanguage: string | null): "sv" | "fr" | "en" {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("sv")) return "sv";
  if (first.startsWith("fr")) return "fr";
  return "en";
}
