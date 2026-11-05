"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RevokeInviteButton({ id, clientName }: { id: string; clientName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/firm/links/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't withdraw the invite. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't withdraw the invite. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={revoke}
        disabled={busy}
        aria-label={`Withdraw the invite for ${clientName}`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Withdraw
      </Button>
      {error ? (
        <span role="alert" className="text-[var(--attention-deep)]" style={{ fontSize: "13px" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
