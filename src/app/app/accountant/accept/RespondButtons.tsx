"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RespondButtons({
  inviteId,
  token,
  firmName,
}: {
  inviteId: string;
  token: string;
  firmName: string;
}) {
  const router = useRouter();
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
        body: JSON.stringify({ inviteId, action, token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; status?: "active" | "revoked" };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save. Try again.");
        return;
      }
      setDone(body.status ?? (action === "accept" ? "active" : "revoked"));
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (done === "active") {
    return (
      <p role="status" className="text-[var(--ink)]" style={{ fontSize: "15px" }}>
        {firmName} is now connected. Their team can see your receipts from now on.
      </p>
    );
  }
  if (done === "revoked") {
    return (
      <p role="status" className="text-[var(--ink)]" style={{ fontSize: "15px" }}>
        Declined. Nothing is shared with {firmName}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" onClick={() => respond("accept")} disabled={busy !== null}>
          {busy === "accept" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Connect {firmName}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => respond("decline")}
          disabled={busy !== null}
        >
          {busy === "decline" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Not now
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
