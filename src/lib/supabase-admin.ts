// SERVER-ONLY. Holds the Supabase service-role client. Never import this
// file from a "use client" component, page, or hook. The service-role key
// bypasses RLS — leaking it to the browser is god-mode-for-anyone.
//
// Defense in depth: SUPABASE_SERVICE_ROLE_KEY is intentionally NOT prefixed
// with NEXT_PUBLIC_, so even if someone imports this from a client file by
// accident, the env var resolves to undefined in the browser bundle and
// getSupabaseAdmin() throws before any request goes out. And since
// 2026-11-18 `import "server-only"` makes such an import fail the build.
// Node scripts that reach this file run with --conditions=react-server.

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase service-role env vars missing");
  }

  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}
