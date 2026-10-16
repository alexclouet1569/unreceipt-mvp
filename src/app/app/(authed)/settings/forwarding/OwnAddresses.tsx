"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The user's own email addresses. An Uber or Stripe receipt is verified
 * automatically only when it was originally sent to one of them, so a real
 * receipt someone else forwards here isn't mistaken for this user's.
 */
export function OwnAddresses({
  accountEmail,
  addresses,
  suggestion,
}: {
  accountEmail: string | null;
  addresses: string[];
  // The Gmail account that asked to forward here, if not listed yet.
  suggestion: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: "POST" | "DELETE", address: string) => {
    setBusy(address);
    setError(null);
    try {
      const res = await fetch("/api/profile/addresses", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't save. Try again.");
        return;
      }
      if (method === "POST") setDraft("");
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        Uber and Stripe receipts are verified automatically only when they were
        sent to one of your own addresses. Anything else, like someone
        else&apos;s receipt forwarded to you, waits under Review needed. Add
        every inbox that forwards receipts here.
      </p>

      <ul
        role="list"
        className="bg-card divide-y divide-[var(--hairline)]"
        style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
        aria-label="Your email addresses"
      >
        {accountEmail ? (
          <li className="flex items-center justify-between gap-3" style={{ padding: "12px 14px", minHeight: "48px" }}>
            <span className="min-w-0 break-all text-[var(--ink)]" style={{ fontSize: "15px" }}>
              {accountEmail}
            </span>
            <span className="shrink-0 text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
              Sign-in email
            </span>
          </li>
        ) : null}
        {addresses.map((address) => (
          <li key={address} className="flex items-center justify-between gap-3" style={{ padding: "2px 2px 2px 14px" }}>
            <span className="min-w-0 break-all text-[var(--ink)]" style={{ fontSize: "15px" }}>
              {address}
            </span>
            <button
              type="button"
              onClick={() => send("DELETE", address)}
              disabled={busy !== null}
              aria-label={`Remove ${address}`}
              className="shrink-0 inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
              style={{ width: "44px", height: "44px", borderRadius: "10px" }}
            >
              {busy === address ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            </button>
          </li>
        ))}
      </ul>

      {suggestion ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          style={{ border: "1px dashed var(--hairline)", borderRadius: "12px", padding: "8px 8px 8px 14px" }}
        >
          <span className="min-w-0 break-all text-[var(--ink)]" style={{ fontSize: "14px" }}>
            Is {suggestion} yours?
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => send("POST", suggestion)}
            disabled={busy !== null}
          >
            {busy === suggestion ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Add it
          </Button>
        </div>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void send("POST", draft.trim());
        }}
      >
        <label htmlFor="own-address" className="sr-only">
          Add an email address
        </label>
        <Input
          id="own-address"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="name@company.se"
          className="h-11 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="outline" className="h-11" disabled={busy !== null || !draft.trim()}>
          {busy === draft.trim() ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Add
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
