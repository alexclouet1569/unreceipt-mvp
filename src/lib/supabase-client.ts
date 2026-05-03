"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Lazily instantiate the browser Supabase client.
 *
 * Two reasons we use `createBrowserClient` from @supabase/ssr instead of
 * the plain `createClient`:
 *
 *   1. PKCE compatibility with the server-side magic-link callback. The
 *      sign-in flow writes a code verifier; the server's /auth/callback
 *      route exchanges the code for a session and needs to read that
 *      verifier. createBrowserClient stores both the verifier AND the
 *      session in cookies (not localStorage), so the server callback can
 *      see them. With the plain createClient (localStorage), the server
 *      can't read the verifier and exchangeCodeForSession fails — which
 *      is the exact "magic link bounces back to /app/login" bug.
 *
 *   2. Lazy init still — same lesson as before: calling createClient at
 *      module load throws "supabaseUrl is required" during the SSR /
 *      prerender pass for any page whose component graph imports this
 *      file, even though the SSR pass never actually uses the client.
 *      Defer until first call.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env vars missing");
  }

  client = createBrowserClient(url, anonKey);
  return client;
}
