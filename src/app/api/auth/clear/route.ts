// User-triggered escape hatch for stale Supabase auth cookies. The founder
// (and pilot testers) routinely delete users, rotate JWT secrets, or retry
// signups — leaving sb-* cookies that point at a user the SDK can no longer
// refresh. signInWithPassword then hangs on the silent JWT refresh attempt.
//
// /app/login's "Reset session" link POSTs here, we wipe every sb-* cookie,
// and the next page load starts from a clean anonymous state.
//
// Intentionally NOT auto-triggered on mount (see PR #25 revert).

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, error: "misconfigured" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  const cookieStore = await cookies();

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          response.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  await supabase.auth.signOut().catch(() => {});

  // Belt and suspenders: large session tokens get chunked into sb-…-auth-token.0,
  // .1, .2; signOut() doesn't always know about every chunk. Wipe everything
  // sb-* on the way out so nothing stale survives.
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set({ name: cookie.name, value: "", maxAge: 0 });
    }
  }

  return response;
}
