"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { User } from "@supabase/supabase-js";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Register service worker for PWA + push notifications
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Check current session
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
      if (!user && pathname !== "/app/login") {
        router.replace("/app/login");
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user && pathname !== "/app/login") {
        router.replace("/app/login");
      }
      if (session?.user && pathname === "/app/login") {
        router.replace("/app");
      }
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  // Show nothing while checking auth (prevents flash)
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center animate-pulse">
          <div className="w-4 h-4 rounded bg-primary/30" />
        </div>
      </div>
    );
  }

  // Login page doesn't need the app shell
  if (pathname === "/app/login") {
    return <>{children}</>;
  }

  // If not logged in, don't render (redirect is happening)
  if (!user) return null;

  return <>{children}</>;
}
