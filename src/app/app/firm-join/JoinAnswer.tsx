"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Join / Not me for a waiting firm seat (POST /api/firm-join). */
export function JoinAnswer({ firmName }: { firmName: string }) {
  const [busy, setBusy] = useState<"join" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (action: "join" | "decline") => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/firm-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { redirect?: string };
      if (res.ok && body.redirect) {
        // Full navigation: /firm and /app read the new membership server-side.
        window.location.assign(body.redirect);
        return;
      }
      setError(
        res.status === 401
          ? "You were signed out. Sign in again and try once more."
          : res.status === 404
            ? "This invitation isn't there any more. Ask the firm to add you again."
            : "Couldn't save. Try again."
      );
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    }
    setBusy(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" onClick={() => answer("join")} disabled={busy !== null}>
          {busy === "join" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
          Join {firmName}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => answer("decline")} disabled={busy !== null}>
          {busy === "decline" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
          Not me
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm rounded-[10px] px-3 py-2 text-[var(--attention-deep)]" style={{ background: "var(--attention-tint)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
