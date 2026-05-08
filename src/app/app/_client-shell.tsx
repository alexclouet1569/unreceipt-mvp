"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";

/**
 * Browser-only shell mounted by /app/layout.tsx so it wraps both the
 * server-gated /app surface and /app/login.
 *
 * Two responsibilities, both inherently client-side:
 *   1. Service worker registration for PWA + push notifications.
 *   2. Live auth-state syncing — when the user signs out from another
 *      tab, bounce them off the dashboard; when they sign in via the
 *      login form, drop them straight onto /app instead of staying
 *      on /app/login.
 *
 * The first-paint authorization gate now lives server-side (see
 * src/app/app/(authed)/page.tsx). This shell never blocks render.
 *
 * Stale-session caveat (do NOT trust onAuthStateChange's session.user
 * payload directly): a Supabase JWT decodes to a user payload as long
 * as its signature checks — even if that user has been deleted server-
 * side. Trusting `session?.user` and replace()-ing to /app would loop
 * with the server gate which DOES validate against the API and
 * redirects back to /app/login. Validate via getUser() before any
 * redirect, and signOut() to clear cookies on validation failure.
 */
export function ClientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Service-worker registration is gated to the product host so the
    // marketing apex never enters a PWA-installable state. localhost +
    // Vercel previews keep registration so dev still exercises the
    // PWA path.
    const hostname = window.location.hostname;
    const isAppHost =
      hostname === "app.unreceipt.com" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".vercel.app");
    if (isAppHost && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const supabase = getSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // No session at all → redirect off authed surfaces.
      if (!session) {
        if (pathname !== "/app/login") {
          router.replace("/app/login");
        }
        return;
      }

      // Session present — validate against the API before trusting it.
      // A deleted user still has a syntactically valid JWT in cookies;
      // getUser() round-trips and returns null in that case.
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        // Stale cookie. Clear it locally so the next render is clean and
        // we don't ping-pong with the server gate.
        await supabase.auth.signOut().catch(() => {});
        if (pathname !== "/app/login") {
          router.replace("/app/login");
        }
        return;
      }

      // Real user — safe to drop them onto the dashboard from /app/login.
      if (pathname === "/app/login") {
        router.replace("/app");
      }
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  return <>{children}</>;
}
