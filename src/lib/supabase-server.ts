// SERVER-ONLY. Reads the current Supabase user from the request cookies via
// @supabase/ssr. Use this from server components, route handlers, and server
// actions that need to know "is anyone logged in" without enforcing the
// admin policy (for that, use requireAdmin from ./require-admin).

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

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

export async function getServerUser(): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase env vars missing");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
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
  if (hasSupabaseAuthCookies(cookieStore.getAll())) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* signOut can throw on already-invalid sessions — ignore */
    }
  }
  return null;
}
