"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Plain-language messages for the errors /api/accountant/respond returns as
// codes rather than sentences.
function errorText(code: string | undefined): string {
  if (code === "not_found") return "This invite isn't valid any more. Ask your accountant to send a new one.";
  if (code === "unauthorized") return "You were signed out. Sign in again and try once more.";
  if (code === "wrong_account") return "This invite was sent to another address. Sign in with that address to answer it.";
  if (!code || code === "bad_request" || code === "forbidden") return "Couldn't save. Try again.";
  return code;
}

/**
 * "Yes, share" / "No thanks" for one accounting-firm invite. Used
 * on the invite page (with the link token) and on the dashboard and in
 * Settings (no token: the invite is matched by the signed-in address).
 */
export function RespondButtons({
  inviteId,
  token,
  firmName,
  showHomeLink = true,
  quietAccept = false,
  onDone,
}: {
  inviteId: string;
  token?: string;
  firmName: string;
  showHomeLink?: boolean;
  // Ink instead of brand green, for screens that already have their green
  // call to action (the receipts page has the capture button).
  quietAccept?: boolean;
  onDone?: (status: "active" | "revoked") => void;
}) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"active" | "revoked" | null>(null);

  const respond = async (action: "accept" | "decline") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/accountant/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteId, action, ...(token ? { token } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: "active" | "revoked" };
      if (!res.ok) {
        setError(errorText(body.error));
        return;
      }
      // No router.refresh(): accepting clears the invite token, so a reload
      // would replace this confirmation with "This link doesn't work".
      const status = body.status ?? (action === "accept" ? "active" : "revoked");
      setDone(status);
      onDone?.(status);
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <div className="space-y-1">
        <p role="status" className="text-[var(--ink)] font-semibold" style={{ fontSize: "15px" }}>
          {done === "active"
            ? `Done. ${firmName} now gets your receipts.`
            : "OK, nothing is shared. They can invite you again later."}
        </p>
        {showHomeLink ? (
          <Link href="/app" className="inline-flex items-center min-h-11 underline text-[var(--ink)]" style={{ fontSize: "15px" }}>
            Go to your receipts
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className={quietAccept ? "h-11 bg-[var(--ink)] text-[var(--surface)] hover:bg-[var(--ink)]/90" : "h-11"}
          onClick={() => respond("accept")}
          disabled={busy !== null}
        >
          {busy === "accept" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Yes, share
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => respond("decline")}
          disabled={busy !== null}
        >
          {busy === "decline" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          No thanks
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          className="text-sm rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
          style={{ background: "var(--attention-tint)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
