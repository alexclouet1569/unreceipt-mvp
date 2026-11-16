"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { basAccountFor } from "@/lib/bookkeeping/bas-map";
import type { Receipt } from "@/lib/types";

const FOUR_DIGITS = /^\d{4}$/;

/**
 * Firm-only: the bookkeeping account this receipt goes on in
 * bookkeeping.csv. Shows the category's suggestion until the firm types its
 * own; "Use the suggestion" clears it again. Saves only `bas_account`
 * (PATCH /api/receipts/[id]), which the route treats as bookkeeping, not a
 * review: the receipt's status doesn't change.
 */
export function BasAccountControl({ receipt }: { receipt: Receipt }) {
  const router = useRouter();
  const suggestion = basAccountFor({ category: receipt.category, bas_account: null });
  const own = receipt.bas_account?.trim() || null;
  const current = own ?? suggestion.account;
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = value.trim();
  const dirty = typed !== current;
  const inputId = `bas-account-${receipt.id}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const save = async (next: string | null) => {
    if (next !== null && !FOUR_DIGITS.test(next)) {
      setError("A BAS account has 4 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${encodeURIComponent(receipt.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bas_account: next }),
      });
      if (!res.ok) {
        setError("Couldn't save the account. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't save the account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-2"
      data-testid="bas-account-control"
      onSubmit={(e) => {
        e.preventDefault();
        // Typing the suggestion itself stores nothing: the receipt keeps
        // following its category.
        void save(typed === suggestion.account ? null : typed);
      }}
    >
      <label htmlFor={inputId} className="block type-caption text-[var(--ink-muted)]">
        BAS account
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          className="h-11 w-28 tabular-nums aria-invalid:border-[var(--attention)] aria-invalid:ring-[var(--attention)]/20"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, "").slice(0, 4));
            setError(null);
          }}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" variant="outline" className="h-11 flex-1" disabled={busy || !dirty}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save account
        </Button>
      </div>
      <p id={helpId} className="type-caption text-[var(--ink-muted)]">
        {own
          ? `Your choice. The category would suggest ${suggestion.account} ${suggestion.name}.`
          : `Suggested from the category: ${suggestion.account} ${suggestion.name}. Change it if you book it elsewhere.`}
      </p>
      {own ? (
        <button
          type="button"
          className="min-h-11 rounded-[10px] type-caption font-semibold text-[var(--ink)] underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          onClick={() => {
            setValue(suggestion.account);
            void save(null);
          }}
          disabled={busy}
        >
          Use the suggestion
        </button>
      ) : null}
      {receipt.exported_at && own !== null ? (
        <p className="type-caption text-[var(--ink-muted)]">
          This receipt was already exported. To get a file with the new account, export the month
          again with “Only receipts not yet exported” unticked.
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="type-caption text-[var(--attention-deep)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
