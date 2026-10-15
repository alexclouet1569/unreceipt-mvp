"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ExportPart = { filename: string; url: string; bytes: number };

/** The last `count` months as YYYY-MM, newest first. */
export function recentMonths(now: Date, count = 13): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Accountant export (launch plan action 45): pick a month (or everything),
 * the server builds a ZIP with receipts.csv, the PDFs and the originals, and
 * we show the download link(s). Links expire after 15 minutes.
 *
 * `fixedPeriod="all"` renders just the button — used inside the
 * delete-account flow, where the point is "download everything first".
 */
export function ExportPanel({ fixedPeriod }: { fixedPeriod?: "all" }) {
  const [period, setPeriod] = useState<string>(
    () => fixedPeriod ?? recentMonths(new Date())[0],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ receiptCount: number; parts: ExportPart[] } | null>(
    null,
  );

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        receiptCount?: number;
        parts?: ExportPart[];
      };
      if (!res.ok) {
        setError(
          res.status === 429
            ? "You've made a lot of exports. Try again in an hour."
            : (body.error ?? "Couldn't create the export. Please try again."),
        );
      } else {
        setResult({ receiptCount: body.receiptCount ?? 0, parts: body.parts ?? [] });
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {fixedPeriod ? null : (
        <div className="space-y-2">
          <label
            htmlFor="export-period"
            className="block uppercase text-[var(--ink-faint)]"
            style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
          >
            Period
          </label>
          <select
            id="export-period"
            className="h-11 w-full rounded-md border bg-card px-3 text-base md:text-sm"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setResult(null);
            }}
          >
            {recentMonths(new Date()).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
            <option value="all">All receipts</option>
          </select>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full h-11 gap-1.5"
        onClick={run}
        disabled={busy}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {busy
          ? "Preparing your export…"
          : fixedPeriod
            ? "Download all receipts (ZIP)"
            : "Create export"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm bg-[var(--attention-tint)] text-[var(--attention-deep)] rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}

      {result ? (
        result.parts.length === 0 ? (
          <p role="status" className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            No receipts in this period.
          </p>
        ) : (
          <div role="status" className="space-y-2">
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
              {result.receiptCount} receipt{result.receiptCount === 1 ? "" : "s"} ready.
              {result.parts.length > 1
                ? ` Download all ${result.parts.length} parts.`
                : ""}{" "}
              The link works for 15 minutes.
            </p>
            <ul className="space-y-2">
              {result.parts.map((p) => (
                <li key={p.url}>
                  <a
                    href={p.url}
                    download={p.filename}
                    className="flex items-center justify-between gap-3 bg-card text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    style={{
                      border: "1px solid var(--hairline)",
                      borderRadius: "10px",
                      minHeight: "44px",
                      padding: "10px 14px",
                      fontSize: "14px",
                    }}
                  >
                    <span className="truncate font-semibold">{p.filename}</span>
                    <span className="shrink-0 text-[var(--ink-faint)]" style={{ fontSize: "13px" }}>
                      {sizeLabel(p.bytes)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
