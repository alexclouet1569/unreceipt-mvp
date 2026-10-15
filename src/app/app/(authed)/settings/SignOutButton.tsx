"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";
import { withTimeout } from "@/lib/with-timeout";

const SIGN_OUT_TIMEOUT_MS = 5_000;

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { error } = await withTimeout(
        "signOut",
        SIGN_OUT_TIMEOUT_MS,
        getSupabaseClient().auth.signOut()
      );
      if (error) throw error;
    } catch (err) {
      // The cookies must go even if Supabase can't be reached, or the
      // login page would restore the session we meant to end.
      console.error("[sign-out] supabase signOut failed", err);
      const cleared = await fetch("/api/auth/clear", { method: "POST" })
        .then((res) => res.ok)
        .catch(() => false);
      if (!cleared) {
        setBusy(false);
        setFailed(true);
        return;
      }
    }
    // Full page load, not router.replace: the login form then starts with a
    // fresh Supabase client instead of the one that held the old session.
    window.location.replace("/app/login");
  };

  return (
    <>
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
      {failed ? (
        <p
          role="alert"
          className="mt-2 text-sm rounded-md px-3 py-2"
          style={{
            background: "var(--attention-tint)",
            color: "var(--attention-deep)",
          }}
        >
          Couldn&apos;t sign you out. Check your connection and try again.
        </p>
      ) : null}
    </>
  );
}
