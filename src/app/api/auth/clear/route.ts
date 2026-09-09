// User-triggered escape hatch that wipes every sb-* Supabase auth cookie and
// signs the session out, so the next page load starts from a clean anonymous
// state. /app/login's "Reset session" link POSTs here.
//
// History / what this is NOT: this began as the suspected fix for the login
// hang, on the hypothesis that stale sb-* cookies (from deleted users,
// rotated JWT secrets, or retried signups) made signInWithPassword hang on a
// silent JWT refresh. PR #27 falsified that: the hang reproduced in a fresh
// incognito window with NO sb-* cookies present, so stale cookies are not the
// cause. The real culprit was the navigator.locks-based session lock, now
// disabled via the no-op lock in src/lib/supabase-client.ts.
//
// We keep this endpoint anyway as a genuine session-reset affordance — it
// still helps users stuck with an invalid session (deleted user, rotated
// secret) get back to a clean state — but it is not the hang fix.
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
