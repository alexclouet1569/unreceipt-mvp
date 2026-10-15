"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
    } catch (err) {
      // The cookies must go even if Supabase can't be reached, or the
      // login page would restore the session we meant to end.
      console.error("[sign-out] supabase signOut failed", err);
      await fetch("/api/auth/clear", { method: "POST" }).catch(() => {});
    }
    // Full page load, not router.replace: the login form then starts with a
    // fresh Supabase client instead of the one that held the old session.
    window.location.replace("/app/login");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="w-full inline-flex items-center justify-center gap-2 bg-card text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors disabled:opacity-60"
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: "10px",
        height: "48px",
        fontSize: "15px",
        fontWeight: 600,
      }}
    >
      <LogOut className="w-4 h-4" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
