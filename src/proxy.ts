// The Next.js proxy (formerly `middleware.ts`). Next 16 registers it only
// next to the `app` directory, which in this repo is `src/app`, so this is
// the only place a proxy may live. Never add a second `proxy.ts` at the repo
// root: with both present, the build took this file's matcher but ran the
// other file's code.
//
// Two steps, in order:
//   1. Any path holding a backslash (raw or `%5C`) answers 404 before
//      anything else runs. No route of ours has one, and browsers and
//      servers disagree on whether `\` means `/`, which is what turns a path
//      like `/\evil.com` into an open redirect or a way around a
//      prefix check.
//   2. `proxy()` from `src/lib/host-proxy.ts`: the apex/app host split, the
//      optimistic /admin gate and the Supabase session refresh.

import { NextResponse, type NextRequest } from "next/server";

import { proxy as hostProxy } from "@/lib/host-proxy";

const BACKSLASH_RE = /%5c|\\/i;

function hasBackslash(pathname: string): boolean {
  return BACKSLASH_RE.test(pathname);
}

export async function proxy(request: NextRequest) {
  if (hasBackslash(request.nextUrl.pathname)) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return hostProxy(request);
}

export const config = {
  // Next reads this statically, so the strings are written out here.
  // 1. Everything except Next internals: HOST_PROXY_MATCHER in
  //    host-proxy.ts (a test keeps them equal).
  // 2. Every path with a backslash, including the ones (1) skips, such as
  //    `/_next/static%5C…` and `/favicon.ico%5C`.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/:path(.*(?:%5[cC]|\\\\).*)",
  ],
};
