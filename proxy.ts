// Next.js 16 root proxy (formerly `middleware.ts`).
//
// Two responsibilities:
//   1. Host-based routing — keep marketing on the apex
//      (unreceipt.com) and product on the app subdomain
//      (app.unreceipt.com). Cross-host visits 308-redirect to the
//      right host. PR #15 already sends www.* → apex via
//      next.config.ts redirects() — that runs before this proxy.
//   2. Optimistic admin gate for /admin/** and /api/admin/**.
//      requireAdmin() inside each admin server action / route handler
//      is the real authorization (plan decision A2 — defense in depth);
//      the proxy keeps non-admins from even reaching those routes.
//
// Local dev (host = localhost / 127.* / a vercel.app preview) is
// neither apex nor app, so the host-routing redirects no-op and both
// surfaces remain reachable on the same host.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isAdminEmail } from "@/lib/auth-admin";

const APEX_HOSTS = new Set(["unreceipt.com", "www.unreceipt.com"]);
const APP_HOST = "app.unreceipt.com";

// Paths that belong on the marketing host. Anything not in either
// list is "neutral" (e.g. /api/health if we ever add one) and stays
// wherever the request landed.
const APEX_ONLY_EXACT = new Set(["/", "/privacy"]);
const APEX_ONLY_PREFIX = ["/demo/", "/api/waitlist"];

// Paths that belong on the product host. Includes Stripe webhook,
// checkout, auth callback, and admin so signups, payments, magic
// links, and operator tools all originate from one cookie origin.
const APP_ONLY_PREFIX = [
  "/app",
  "/admin",
  "/auth",
  "/subscribe",
  "/api/checkout",
  "/api/webhooks",
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
  "/opengraph-image",
]);
const STATIC_EXT_RE = /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|css|js|map)$/i;

function isStaticAsset(path: string): boolean {
  if (path.startsWith("/_next") || path.startsWith("/icons")) return true;
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

  // Cross-host redirects. 308 preserves method + body so a POST to the
  // wrong host (e.g. a still-pointing-at-apex Stripe webhook) survives
  // the transition window while the founder updates the dashboard URLs.
  if (onApex && isAppOnly(path)) {
    return NextResponse.redirect(
      new URL(path + request.nextUrl.search, `https://${APP_HOST}`),
      308
    );
  }
  if (onApp && isApexOnly(path)) {
    return NextResponse.redirect(
      new URL(path + request.nextUrl.search, "https://unreceipt.com"),
      308
    );
  }

  // Admin allowlist — runs on whichever host we ended up on. After the
  // split this is effectively only the app host; before / during DNS
  // propagation it also protects apex.
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    return adminGate(request);
  }

  return NextResponse.next();
}

async function adminGate(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isApiPath = request.nextUrl.pathname.startsWith("/api/admin");

  if (!supabaseUrl || !supabaseAnon) {
    return forbid(request, isApiPath);
  }

  const response = NextResponse.next();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          response.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return forbid(request, isApiPath);
  }

  return response;
}

function forbid(request: NextRequest, isApiPath: boolean) {
  if (isApiPath) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/app", request.url));
}

export const config = {
  // Match everything except Next internals — the static-asset check
  // above filters the rest. _next/static and _next/image are excluded
  // here too so we don't even invoke the proxy for them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
