// SERVER-ONLY. The "real" admin authorization gate (plan decision A2,
// defense in depth). Re-reads the Supabase session cookie via @supabase/ssr,
// re-checks the allowlist, and throws AdminAuthError on either miss.
//
// Every admin server action and every /api/admin/* route handler must call
// this before doing anything else. The proxy.ts gate is optimistic; this
// is the gate that actually protects the data.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

import { isAdminEmail } from "./auth-admin";

export type AdminAuthReason = "no_user" | "not_admin";

export class AdminAuthError extends Error {
  reason: AdminAuthReason;
  constructor(reason: AdminAuthReason) {
    super(reason === "no_user" ? "Not authenticated" : "Not an admin");
    this.name = "AdminAuthError";
    this.reason = reason;
  }
}

export async function requireAdmin(): Promise<User> {
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
        // Server components cannot mutate cookies. Server actions and route
        // handlers can. Swallow the error in the read-only case so requireAdmin
        // remains usable from layouts.
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context */
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AdminAuthError("no_user");
  if (!isAdminEmail(user.email)) throw new AdminAuthError("not_admin");

  return user;
}
