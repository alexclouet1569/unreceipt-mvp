import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// The magic-link / OAuth-callback handler. Supabase appends `?code=…` to
// emailRedirectTo; this route exchanges that code for a session and writes
// the auth cookie SERVER-SIDE so the next request (gated by the server-
// rendered /app layout via cookies()) is recognised as authenticated.
//
// Without this hop, the browser-side SDK would receive the session, but the
// HTTP-only Supabase auth cookie never gets set on the response — every
// subsequent server-rendered nav lands in the "no user" branch and bounces
// the user back to /app/login.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_NEXT_RE = /^\/[a-zA-Z0-9_\-/?=&%.]*$/;

function safeNext(raw: string | null): string {
  // Only allow same-origin paths starting with "/" to avoid open-redirect.
  if (!raw) return "/app";
  if (!SAFE_NEXT_RE.test(raw)) return "/app";
  return raw;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  const next = safeNext(url.searchParams.get("next"));

  // Supabase forwards explicit auth errors as `?error=…&error_code=…` —
  // surface them straight on /app/login instead of running through the
  // exchange (which would just fail with a less specific message).
  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/app/login?error=${encodeURIComponent(errorParam)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/app/login?error=missing_code", request.url)
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[auth/callback] supabase env vars missing");
    return NextResponse.redirect(
      new URL("/app/login?error=misconfigured", request.url)
    );
  }

  // Build the redirect response first so the Supabase client can write
  // its session cookies onto it via setAll. The createServerClient pattern
  // requires us to mutate the SAME response we eventually return — that's
  // how the Set-Cookie headers actually reach the browser.
  const response = NextResponse.redirect(new URL(next, request.url));

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          response.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed", error);
    return NextResponse.redirect(
      new URL(
        `/app/login?error=${encodeURIComponent(error.message ?? "auth_failed")}`,
        request.url
      )
    );
  }

  return response;
}
