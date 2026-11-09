// SERVER-ONLY. Reads the current Supabase user from the request, via
// @supabase/ssr cookies (the website) or an `Authorization: Bearer <access
// token>` header (the native iPhone app, `mobile/`, which keeps its session in
// the Keychain and has no cookies). Use this from server components, route
// handlers, and server actions that need to know "is anyone logged in"
// without enforcing the admin policy (for that, use requireAdmin from
// ./require-admin).
//
// A request that carries a well-formed bearer JWT is judged on that token
// alone: an invalid or revoked token is "not signed in", never a fall back to
// cookies. (A header that isn't a bearer JWT at all is ignored.) Bearer
// tokens are never sent by a browser on its own, so they add no CSRF surface.

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

// Heuristic: any cookie whose name starts with `sb-` is a Supabase auth
// cookie (sb-access-token, sb-refresh-token, sb-<project>-auth-token).
// We only attempt the stale-cookie clear path when we actually saw one
// of these on the request — avoids paying for a no-op signOut on every
// anonymous page hit.
function hasSupabaseAuthCookies(
  all: ReadonlyArray<{ name: string }>
): boolean {
  return all.some((c) => c.name.startsWith("sb-"));
}

function supabaseEnv(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase env vars missing");
  }
  return { url, anon };
}

// A JWT: three base64url parts. Anything else in the header is ignored.
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * The access token the native app sends as `Authorization: Bearer …`, or
 * null (a browser request, or no request at all, e.g. a script).
 */
export async function bearerAccessToken(): Promise<string | null> {
  let value: string | null;
  try {
    value = (await headers()).get("authorization");
  } catch {
    // Outside a request scope there are no headers.
    return null;
  }
  return value?.trim().match(BEARER)?.[1] ?? null;
}

async function cookieClient(): Promise<SupabaseClient> {
  const { url, anon } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context (e.g. server component) — silently drop */
        }
      },
    },
  });
}

// A client that acts as the bearer token's user (RLS applies), keeps
// nothing between requests and never refreshes: refreshing is the app's job.
function bearerClient(token: string): SupabaseClient {
  const { url, anon } = supabaseEnv();
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * A Supabase client acting as the signed-in caller, so row-level security
 * applies: the app's bearer token when there is one, the browser's cookies
 * otherwise. Call getServerUser() first; this doesn't check anything itself.
 */
export async function getUserSupabase(): Promise<SupabaseClient> {
  const token = await bearerAccessToken();
  return token ? bearerClient(token) : cookieClient();
}

/**
 * The verified claims of the caller's access token (`amr`, `exp`, …), or
 * null. Used where *this session's* sign-in time matters (account deletion).
 * Checks the signature and expiry only, not whether the session was signed
 * out: call getServerUser() first (it asks Supabase Auth, which does).
 */
export async function getSessionClaims(): Promise<Record<string, unknown> | null> {
  const token = await bearerAccessToken();
  const supabase = token ? bearerClient(token) : await cookieClient();
  const { data, error } = token
    ? await supabase.auth.getClaims(token)
    : await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims as Record<string, unknown>;
}

export async function getServerUser(): Promise<User | null> {
  const token = await bearerAccessToken();
  if (token) {
    const { data, error } = await bearerClient(token).auth.getUser(token);
    return data.user && !error ? data.user : null;
  }

  const supabase = await cookieClient();
  const { data, error } = await supabase.auth.getUser();
  if (data.user && !error) {
    return data.user;
  }

  // Stale-session repair: when getUser() fails BUT the request did
  // carry sb-* cookies, the cookies refer to a user that no longer
  // validates (deleted user, rotated JWT secret, expired refresh token
  // chain). signOut() asks @supabase/ssr to write the clearing cookies
  // via the setAll callback above — which works in middleware / route
  // handler / server-action contexts. Server-component callers can't
  // mutate cookies on the response, so the try/catch silently drops
  // the writes there; the client-side ClientShell catches that case
  // by validating + signing out in the browser. Defense in depth.
  const cookieStore = await cookies();
  if (hasSupabaseAuthCookies(cookieStore.getAll())) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* signOut can throw on already-invalid sessions — ignore */
    }
  }
  return null;
}
