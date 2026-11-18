// SERVER-ONLY. The "real" admin authorization gate (plan decision A2,
// defense in depth). Re-reads the Supabase session cookie via @supabase/ssr,
// re-checks the allowlist, and throws AdminAuthError on either miss.
//
// Every admin server action and every /api/admin/* route handler must call
// this before doing anything else. The proxy gate (src/lib/host-proxy.ts) is optimistic; this
// is the gate that actually protects the data.
//
// Since 2026-11-18 it also requires a second sign-in step (Supabase MFA,
// TOTP: the session's `aal` claim is "aal2"). Only the page that sets one up
// or asks for the code (/admin/mfa) passes { allowWithoutMfa: true }.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

import { ADMIN_MFA_PATH, hasSecondFactor, isAdminEmail } from "./auth-admin";

export type AdminAuthReason = "no_user" | "not_admin" | "mfa_required";

export class AdminAuthError extends Error {
  reason: AdminAuthReason;
  constructor(reason: AdminAuthReason) {
    super(
      reason === "no_user"
        ? "Not authenticated"
        : reason === "not_admin"
          ? "Not an admin"
          : "Second sign-in step required"
    );
    this.name = "AdminAuthError";
    this.reason = reason;
  }
}

export type RequireAdminOptions = {
  /** Only for /admin/mfa, where the admin sets up or enters the code. */
  allowWithoutMfa?: boolean;
};

export async function requireAdmin(options: RequireAdminOptions = {}): Promise<User> {
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

  if (!options.allowWithoutMfa) {
    // getClaims() verifies the access token's signature; getUser() above
    // already confirmed the same session is live.
    const { data, error } = await supabase.auth.getClaims();
    if (error || !hasSecondFactor(data?.claims as Record<string, unknown> | undefined)) {
      throw new AdminAuthError("mfa_required");
    }
  }

  return user;
}

/**
 * For admin pages and layouts: same gate as requireAdmin(), but a
 * non-admin is redirected to /app (which bounces to /app/login when
 * signed out) instead of seeing an error. Call it in every admin page,
 * not only the layout — layouts don't re-run on client navigations.
 */
export async function requireAdminPage(options: RequireAdminOptions = {}): Promise<User> {
  try {
    return await requireAdmin(options);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      redirect(err.reason === "mfa_required" ? ADMIN_MFA_PATH : "/app");
    }
    throw err;
  }
}
