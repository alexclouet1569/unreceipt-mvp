// Next.js 16 root proxy (formerly `middleware.ts`). Optimistic admin gate
// for /admin/** and /api/admin/**. The real authorization is the
// requireAdmin() re-check inside each admin server action / route handler
// (plan decision A2 — defense in depth). The proxy keeps non-admins from
// even reaching those routes; requireAdmin() is what actually protects the
// data if someone bypasses the proxy.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isAdminEmail } from "@/lib/auth-admin";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail-closed if env is missing: never let a misconfigured deploy
  // accidentally expose /admin.
  const isApiPath = request.nextUrl.pathname.startsWith("/api/admin");
  if (!url || !anon) {
    return forbid(request, isApiPath);
  }

  const response = NextResponse.next();
  const supabase = createServerClient(url, anon, {
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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
