"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANY_COUNTRIES,
  COMPANY_COUNTRY_LABELS,
  type CompanyCountry,
} from "@/lib/company-country";

/**
 * Where the company is established. Decides whether receipts get the
 * Swedish VAT check (only for Sweden). Saves on change.
 */
export function CompanyCountryForm({ initial }: { initial: CompanyCountry | null }) {
  const router = useRouter();
  const [value, setValue] = useState<CompanyCountry | "">(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: CompanyCountry) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/country", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ country: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      console.error("[settings] country save failed", err);
      setValue(previous);
      setError("Couldn’t save the country. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2" style={{ padding: "12px 14px" }}>
      <label
        htmlFor="company-country"
        className="block text-[var(--ink-muted)]"
        style={{ fontSize: "13px", fontWeight: 500 }}
      >
        Company country
      </label>
      <select
        id="company-country"
        className="h-11 w-full rounded-md border bg-card px-3 text-base md:text-sm"
        value={value}
        disabled={saving}
        onChange={(e) => {
          if (e.target.value) void save(e.target.value as CompanyCountry);
        }}
      >
        {value === "" ? (
          <option value="" disabled>
            Choose a country
          </option>
        ) : null}
        {COMPANY_COUNTRIES.map((c) => (
          <option key={c} value={c}>
            {COMPANY_COUNTRY_LABELS[c]}
          </option>
        ))}
      </select>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
        Receipts of a company in Sweden are checked against Swedish VAT rules.
        Other countries’ rules aren’t checked yet.
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded-md px-3 py-2 text-[var(--attention-deep)]"
          style={{ fontSize: "13px", background: "var(--attention-tint)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
