"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase-client";

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
 */
export function ClientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!session?.user && pathname !== "/app/login") {
        router.replace("/app/login");
      }
      if (session?.user && pathname === "/app/login") {
        router.replace("/app");
      }
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  return <>{children}</>;
}
