"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function SubscribeButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't start checkout. Try again.");
        setLoading(false);
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) {
        setError("Checkout URL missing from response.");
        setLoading(false);
        return;
      }
      window.location.href = url;
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        className="w-full gap-2"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? "Starting checkout..." : "Subscribe"}
      </Button>
      {error ? (
        <p className="text-xs text-destructive text-center">{error}</p>
      ) : null}
    </div>
  );
}
