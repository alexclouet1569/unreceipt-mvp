"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Critical-gap fix #1: when the self-heal Stripe lookup fails (or its
 * upsert errors), we don't punish the customer with an immediate bounce
 * to /subscribe. We show this spinner for ~3s, then drop the session_id
 * by replacing the URL with /app, which re-runs the server gate. By then
 * the webhook has usually caught up, and the gate finds the row and
 * renders the dashboard. If it still doesn't, the gate falls through to
 * redirect_subscribe — same place the impatient bounce would have sent
 * them, just with one bounded retry first.
 */
export function SelfHealSpinner() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/app");
    }, 3000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
        <h2 className="font-semibold text-lg mb-1">Setting up your account…</h2>
        <p className="text-sm text-muted-foreground">
          Just a moment while we finish your subscription.
        </p>
      </div>
    </div>
  );
}
