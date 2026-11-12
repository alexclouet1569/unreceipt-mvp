"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function errorText(code: string | undefined): string {
  if (code === "not_found") return "This invite isn't valid any more. Ask your client to send a new one.";
  if (code === "wrong_account") return "This invite was sent to another address. Sign in with that address to answer it.";
  if (code === "firm_name_required") return "Enter your firm's name.";
  if (code === "firm_name_invalid") return "Enter your firm's name as it's registered, without a web or email address.";
  if (code === "unauthorized") return "You were signed out. Sign in again and try once more.";
  if (code === "join_firm_first")
    return "A firm added you to its team. Open the firm portal to join it, then accept this request there.";
  if (!code || code === "bad_request" || code === "forbidden") return "Couldn't save. Try again.";
  return code;
}

/**
 * Accept / No thanks for a client company's invite, answered by the
 * accountant it was sent to (POST /api/firm-request/respond). Without a
 * firm yet (`needsFirm`), the accountant names it and it is created with
 * the accept.
 */
export function RequestAnswer({
  inviteId,
  clientName,
  needsFirm,
  onDone,
}: {
  inviteId: string;
  clientName: string;
  needsFirm: boolean;
  onDone?: (status: "active" | "revoked") => void;
}) {
  const [firmName, setFirmName] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"active" | "revoked" | null>(null);

  const respond = async (action: "accept" | "decline") => {
    if (action === "accept" && needsFirm && firmName.trim().length < 2) {
      setError(errorText("firm_name_required"));
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/firm-request/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteId, action, ...(needsFirm ? { firmName: firmName.trim() } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        status?: "active" | "revoked";
      };
      if (!res.ok) {
        setError(body.error === "join_firm_first" && body.message ? body.message : errorText(body.error));
        return;
      }
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
          {done === "active" ? `Done. You now see ${clientName}'s receipts.` : "OK, nothing is shared."}
        </p>
        {done === "active" ? (
          <Link href="/firm/clients" className="inline-flex items-center min-h-11 underline text-[var(--ink)]" style={{ fontSize: "15px" }}>
            Open your clients
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {needsFirm ? (
        <label className="block space-y-1">
          <span className="block text-[var(--ink)]" style={{ fontSize: "13px", fontWeight: 600 }}>
            Your firm&apos;s name
          </span>
          <input
            value={firmName}
            onChange={(e) => setFirmName(e.target.value)}
            maxLength={200}
            autoComplete="organization"
            className="w-full h-11 rounded-[6px] border border-[var(--hairline)] bg-card px-3 text-[16px] text-[var(--ink)] outline-none focus:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50"
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" onClick={() => respond("accept")} disabled={busy !== null}>
          {busy === "accept" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Accept
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => respond("decline")} disabled={busy !== null}>
          {busy === "decline" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          No thanks
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
