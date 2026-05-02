"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Lazily instantiate the browser Supabase client. The previous shape
 * called createClient at module load, which throws "supabaseUrl is
 * required" during the SSR / prerender pass for any page whose
 * component graph imports this module — even though the SSR pass never
 * actually uses the client. Keep the same singleton, just defer the
 * createClient call until something reads from it. Mirrors the pattern
 * of getStripe / getSupabaseAdmin / getServerUser.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env vars missing");
  }

  client = createClient(url, anonKey);
  return client;
}
