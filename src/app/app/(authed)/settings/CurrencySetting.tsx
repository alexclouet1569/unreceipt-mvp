"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCY_OPTIONS } from "@/lib/receipt-format";

/**
 * Settings → "Your currency": the company's currency. Receipts in another
 * currency keep their amount and also show it converted (ECB rate of the
 * purchase day); totals and the accountant's export use the converted one.
 */
export function CurrencySetting({ currency }: { currency: string }) {
  const router = useRouter();
  const [value, setValue] = useState(currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/organization/currency", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currency: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setValue(previous);
        setError(body.error ?? "Couldn't save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setValue(previous);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-card space-y-2"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
    >
      <label className="flex items-center justify-between gap-3">
        <span className="text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
          Your company&apos;s currency
        </span>
        <select
          value={value}
          disabled={saving}
          onChange={(e) => save(e.target.value)}
          className="h-11 rounded-[6px] border border-[var(--hairline)] bg-card px-3 text-[16px] text-[var(--ink)]"
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.4 }}>
        Receipts in another currency are converted at the ECB rate of the purchase day. Totals and your
        accountant&apos;s export use this currency.
      </p>
      {error ? (
        <p role="alert" className="text-[var(--attention-deep)]" style={{ fontSize: "13px" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
