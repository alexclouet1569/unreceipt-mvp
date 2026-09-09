"use client";

import { useEffect, useState } from "react";
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
  // When the Supabase browser client can't be created (e.g. a missing
  // NEXT_PUBLIC_SUPABASE_* build var), we degrade instead of throwing: the
  // auth-state syncing simply doesn't run and we show a non-blocking banner.
  // Throwing here used to take down the whole /app tree — with no error
  // boundary above, that left the login form dead and unclickable.
  const [clientUnavailable, setClientUnavailable] = useState(false);

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

    // getSupabaseClient() throws if the public Supabase env vars are missing.
    // Catch it so a config gap degrades to "auth sync disabled" rather than
    // crashing the tree. Everything that depends on the client lives inside
    // this try; the cleanup only unsubscribes if we got that far.
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        console.log("[auth-debug] cb:enter", event);
        // This callback MUST stay synchronous and MUST NOT await any
        // supabase-js call. supabase-js awaits every onAuthStateChange
        // handler before signInWithPassword / getSession / etc. resolve, so
        // an inline `await supabase.auth.getUser()` here deadlocks: the
        // sign-in promise waits on this handler, this handler waits on
        // getUser(), and getUser() waits behind the same in-flight auth call.
        // The round-trip returns 200 and the session persists, but the
        // promise never settles. So: do only synchronous navigation inline,
        // and defer any Supabase work onto a fresh task with setTimeout(…, 0)
        // so this handler returns immediately and the triggering call can
        // resolve.

        // No session at all → redirect off authed surfaces. Pure navigation,
        // no Supabase call, so it's safe inline.
        if (!session) {
          if (pathname !== "/app/login") {
            router.replace("/app/login");
          }
          return;
        }

        // Session present — validate out-of-band, on a later task, so we're
        // no longer inside the auth call that emitted this event. The
        // deleted-user guard still runs; it just doesn't block the callback.
        setTimeout(() => {
          void (async () => {
            // A deleted user still has a syntactically valid JWT in cookies;
            // getUser() round-trips and returns null in that case.
            const { data: userData, error } = await supabase.auth.getUser();
            if (error || !userData.user) {
              // Stale cookie / deleted user. Clear it locally so the next
              // render is clean and we don't ping-pong with the server gate.
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
          })();
        }, 0);

        console.log("[auth-debug] cb:exit", event);
      });
      subscription = data.subscription;
    } catch (err) {
      console.error("[client-shell] Supabase client unavailable", err);
      // Intentional error-path setState: fires at most once (the client
      // either constructs or it doesn't for the life of the page), so there
      // is no cascading-render loop. This is the whole point — degrade to a
      // visible banner instead of throwing and taking down the tree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientUnavailable(true);
    }

    return () => subscription?.unsubscribe();
  }, [router, pathname]);

  return (
    <>
      {clientUnavailable && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive text-sm text-center px-4 py-2"
        >
          We&apos;re having trouble connecting. Sign-in and syncing may not work
          right now — please reload, or try again shortly.
        </div>
      )}
      {children}
    </>
  );
}
