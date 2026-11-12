"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

/**
 * Opens the Stripe customer portal (POST /api/billing/portal): change plan,
 * update the card, download invoices or cancel. Website only — Settings
 * and /subscribe never render it inside the store apps.
 */
export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(
          res.status === 429
            ? "Too many tries just now. Wait a minute, then try again."
            : body.error ?? "Couldn't open billing. Try again in a moment."
        );
        setBusy(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Couldn't open billing. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="type-body font-semibold w-full h-12 inline-flex items-center justify-center gap-2 rounded-[10px] border border-[var(--hairline)] bg-card text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
      >
        <CreditCard className="w-4 h-4" aria-hidden="true" />
        {busy ? "Opening billing…" : "Manage billing"}
      </button>
      {error ? (
        <p
          role="alert"
          className="type-caption mt-2 rounded-[6px] px-3 py-2 bg-[var(--attention-tint)] text-[var(--attention-deep)]"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
