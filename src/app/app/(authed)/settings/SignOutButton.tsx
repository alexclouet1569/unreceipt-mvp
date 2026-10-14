"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    await getSupabaseClient().auth.signOut();
    router.replace("/app/login");
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
