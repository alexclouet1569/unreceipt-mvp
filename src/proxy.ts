// The proxy Next.js actually runs. Next looks for proxy.ts next to the `app`
// directory, which here is `src/`. The host split, admin gate and session
// refresh in `src/lib/host-proxy.ts` (the former repo-root proxy.ts, which
// never ran) are not wired in yet; see the note at its top. Until they are,
// this file does one job only. Never add a proxy.ts at the repo root: with
// both present, the build used this file's matcher but ran the root's code.
//
// A backslash in the path, percent-encoded (`/demo%5C`) or decoded, names no
// route of ours. On Vercel such a request didn't 404: the server looked for a
// page module named after the encoded path (`.next/server/pages/demo%5C.js`)
// and answered 500 MODULE_NOT_FOUND, which crawlers trigger and Sentry
// reports. Answer 404 here instead. Never redirect to a "cleaned" path:
// turning backslashes into slashes can produce `//evil.com`, an open redirect.

import { NextResponse, type NextRequest } from "next/server";

const BACKSLASH_RE = /\\|%5c/i;

export function hasBackslash(path: string): boolean {
  return BACKSLASH_RE.test(path);
}

export function proxy(request: NextRequest) {
  if (hasBackslash(request.nextUrl.pathname)) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  // Only reached if the matcher and the check above ever disagree.
  return NextResponse.next();
}

export const config = {
  // Run only for paths holding a backslash, so ordinary requests pay nothing.
  // Next tests a matcher against both the raw and the decoded path, hence
  // `%5C` in either case and a literal backslash. No exclusions: `/_next/…`
  // and `/favicon.ico…` with a backslash are caught too.
  matcher: ["/:path(.*(?:%5[cC]|\\\\).*)"],
};
