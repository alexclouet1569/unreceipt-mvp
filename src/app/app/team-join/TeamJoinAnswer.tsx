"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Join / Not me for a waiting team invite (POST /api/team-join). */
// An accounting-firm account can't join (`canJoin` false, one account, one
// role): it can only remove the invitation.
export function TeamJoinAnswer({
  inviteId,
  companyName,
  canJoin = true,
}: {
  inviteId: string;
  companyName: string;
  canJoin?: boolean;
}) {
  const [busy, setBusy] = useState<"join" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (action: "join" | "decline") => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/team-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, inviteId }),
      });
      const body = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string };
      if (res.ok && body.redirect) {
        // Full navigation: /app reads the new membership server-side.
        window.location.assign(body.redirect);
        return;
      }
      setError(
        res.status === 401
          ? "You were signed out. Sign in again and try once more."
          : res.status === 404
            ? "This invitation isn't there any more. Ask to be invited again."
            : body.error === "already_in_a_team"
              ? "You're already in another company's team. Ask its owner to remove you first."
              : body.error === "firm_account"
                ? "This account is for an accounting firm, so it can't also join a company. Ask to be invited at another email address of yours."
                : body.error === "own_company"
                  ? "This is your own company: you're already its owner."
                  : body.error === "email_not_confirmed"
                    ? "Confirm your email address first, then try again."
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
        {canJoin ? (
          <Button type="button" className="h-auto min-h-11 whitespace-normal text-left" onClick={() => answer("join")} disabled={busy !== null}>
            {busy === "join" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
            Join {companyName}
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="h-11" onClick={() => answer("decline")} disabled={busy !== null}>
          {busy === "decline" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
          {canJoin ? "Not me" : "Remove invitation"}
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
