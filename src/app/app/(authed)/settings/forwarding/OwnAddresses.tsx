"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ERROR_ID = "own-address-error";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

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
      setAnnouncement(method === "POST" ? `Added ${address}` : `Removed ${address}`);
      router.refresh();
      // The button that was pressed goes away with the refresh; keep focus
      // somewhere sensible for keyboard and screen-reader users.
      inputRef.current?.focus();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const hasRows = accountEmail != null || addresses.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        Uber and Stripe receipts are verified automatically only when they were
        sent to one of your own addresses. Anything else, like someone
        else&apos;s receipt forwarded to you, waits under Review needed. Add
        every inbox that forwards receipts here.
      </p>

      {hasRows ? (
        <ul
          role="list"
          className="bg-card divide-y divide-[var(--hairline)]"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
        >
          {accountEmail ? (
            <li className="flex items-center justify-between gap-3" style={{ padding: "12px 14px", minHeight: "48px" }}>
              <span className="min-w-0 [overflow-wrap:anywhere] text-[var(--ink)]" style={{ fontSize: "15px" }}>
                {accountEmail}
              </span>
              <span className="shrink-0 text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                Sign-in email
              </span>
            </li>
          ) : null}
          {addresses.map((address) => (
            <li key={address} className="flex items-center justify-between gap-3" style={{ padding: "2px 2px 2px 14px" }}>
              <span className="min-w-0 [overflow-wrap:anywhere] text-[var(--ink)]" style={{ fontSize: "15px" }}>
                {address}
              </span>
              <button
                type="button"
                onClick={() => send("DELETE", address)}
                disabled={busy !== null}
                aria-label={`Remove ${address}`}
                className="shrink-0 inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-[-2px]"
                style={{ width: "44px", height: "44px", borderRadius: "10px" }}
              >
                {busy === address ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {suggestion ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          style={{ border: "1px dashed var(--hairline)", borderRadius: "12px", padding: "8px 8px 8px 14px" }}
        >
          <span className="min-w-0 text-[var(--ink)]" style={{ fontSize: "14px" }}>
            Is <span className="[overflow-wrap:anywhere]">{suggestion}</span> yours?
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
          ref={inputRef}
          id="own-address"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Another email address"
          className="h-11 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
        />
        <Button type="submit" variant="outline" className="h-11" disabled={busy !== null || !draft.trim()}>
          {busy === draft.trim() ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Add
        </Button>
      </form>

      {/* A failed add or remove loses nothing: attention tokens, not red. */}
      {error ? (
        <p
          id={ERROR_ID}
          role="alert"
          className="text-sm rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
          style={{ background: "var(--attention-tint)" }}
        >
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
