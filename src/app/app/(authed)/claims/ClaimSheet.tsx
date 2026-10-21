"use client";

// The month's expense claim: one card per receipt with the type, place and
// purpose an employer's expense form asks for. Values UnReceipt worked out
// are marked "Suggested" until the person saves or confirms them; the
// totals and the PDF follow what's on screen.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/receipt-format";
import {
  CLAIM_TYPES,
  MAX_CLAIM_PLACE,
  MAX_CLAIM_PURPOSE,
  buildClaimLines,
  claimDayLabel,
  claimMonthLabel,
  claimTotals,
  claimTypeLabel,
  type ClaimLine,
  type ClaimReceipt,
  type PurposeHistoryEntry,
} from "@/lib/claims/claim";
import type { ClaimType } from "@/lib/types";

type ClaimField = "claim_type" | "claim_place" | "claim_purpose";
type ClaimPatch = Partial<Record<ClaimField, string | null>>;
type Drafts = Record<string, Partial<Record<"place" | "purpose", string>>>;

export type ClaimSheetProps = {
  month: string;
  prevMonth: string;
  nextMonth: string;
  receipts: ClaimReceipt[];
  history: PurposeHistoryEntry[];
  loadError: string | null;
};

export function ClaimSheet({
  month,
  prevMonth,
  nextMonth,
  receipts: initialReceipts,
  history,
  loadError,
}: ClaimSheetProps) {
  const [receipts, setReceipts] = useState(initialReceipts);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const lines = useMemo(() => buildClaimLines(receipts, history), [receipts, history]);
  const readyLines = lines.filter((l) => l.ready);
  const totals = useMemo(() => claimTotals(lines), [lines]);
  const pendingCount = lines.length - readyLines.length;
  const toConfirm = lines.filter((l) => Object.keys(confirmPatch(l)).length > 0);

  const save = async (id: string, patch: ClaimPatch): Promise<boolean> => {
    try {
      const res = await fetch(`/api/receipts/${id}/claim`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          issues?: Array<{ message: string }>;
        };
        setErrors((e) => ({
          ...e,
          [id]: body.issues?.[0]?.message ?? "Couldn't save. Try again.",
        }));
        return false;
      }
    } catch {
      setErrors((e) => ({ ...e, [id]: "Network error. Check your connection and try again." }));
      return false;
    }
    setErrors((e) => without(e, id));
    setReceipts((rs) =>
      rs.map((r) => (r.id === id ? { ...r, ...(patch as Partial<ClaimReceipt>) } : r)),
    );
    return true;
  };

  const commitText = async (line: ClaimLine, key: "place" | "purpose") => {
    const draft = drafts[line.receipt.id]?.[key];
    if (draft === undefined) return;
    const field: ClaimField = key === "place" ? "claim_place" : "claim_purpose";
    const saved = (line.receipt[field] ?? "").trim();
    const next = draft.trim();
    // Leaving a suggestion untouched isn't a confirmation; "Confirm" is.
    if (next !== saved && !(next === line[key] && line.suggested[key])) {
      if (!(await save(line.receipt.id, { [field]: next || null }))) return;
    }
    setDrafts((d) => {
      const left = without(d[line.receipt.id] ?? {}, key);
      return Object.keys(left).length > 0
        ? { ...d, [line.receipt.id]: left }
        : without(d, line.receipt.id);
    });
  };

  const confirmAll = async () => {
    setConfirming(true);
    for (const line of toConfirm) {
      await save(line.receipt.id, confirmPatch(line));
    }
    setConfirming(false);
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/claims/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setPdfError(
          res.status === 429
            ? "You've made a lot of claim PDFs. Try again in an hour."
            : (body.error ?? "Couldn't create the claim PDF. Please try again."),
        );
      } else {
        window.location.assign(body.url);
      }
    } catch {
      setPdfError("Network error. Check your connection and try again.");
    }
    setPdfBusy(false);
  };

  return (
    <div className="space-y-6">
      <nav aria-label="Month" className="flex items-center justify-between gap-2">
        <MonthLink href={`/app/claims?month=${prevMonth}`} label={`Previous month, ${claimMonthLabel(prevMonth)}`}>
          <ChevronLeft className="w-5 h-5" />
        </MonthLink>
        <h2
          className="font-display font-bold text-[var(--ink)]"
          style={{ fontSize: "22px", letterSpacing: "-0.02em" }}
        >
          {claimMonthLabel(month)}
        </h2>
        <MonthLink href={`/app/claims?month=${nextMonth}`} label={`Next month, ${claimMonthLabel(nextMonth)}`}>
          <ChevronRight className="w-5 h-5" />
        </MonthLink>
      </nav>

      {loadError ? (
        <Notice>{loadError}</Notice>
      ) : lines.length === 0 ? (
        <p className="text-center text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
          No receipts in {claimMonthLabel(month)}.
        </p>
      ) : (
        <>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
            Check each line, then copy it into your employer&apos;s expense form.
            Print the PDF and staple each original receipt next to its number.
          </p>

          {toConfirm.length > 0 ? (
            <Button
              type="button"
              className="w-full h-11"
              onClick={confirmAll}
              disabled={confirming}
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {confirming
                ? "Saving…"
                : `Confirm ${toConfirm.length} suggested line${toConfirm.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}

          {pendingCount > 0 ? (
            <Notice>
              {pendingCount} receipt{pendingCount === 1 ? " needs" : "s need"} review
              before {pendingCount === 1 ? "it goes" : "they go"} on the claim.
              Open {pendingCount === 1 ? "it" : "them"} from{" "}
              <Link href="/app" className="underline">
                your receipts
              </Link>
              .
            </Notice>
          ) : null}

          <ol className="space-y-2">
            {lines.map((line) => (
              <li key={line.receipt.id}>
                <LineCard
                  line={line}
                  drafts={drafts[line.receipt.id] ?? {}}
                  error={errors[line.receipt.id] ?? null}
                  onType={(type) => void save(line.receipt.id, { claim_type: type })}
                  onDraft={(key, value) =>
                    setDrafts((d) => ({
                      ...d,
                      [line.receipt.id]: { ...d[line.receipt.id], [key]: value },
                    }))
                  }
                  onCommit={(key) => void commitText(line, key)}
                />
              </li>
            ))}
          </ol>

          {readyLines.length > 0 ? (
            <section
              aria-labelledby="claim-totals"
              className="bg-card"
              style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
            >
              <h3
                id="claim-totals"
                className="uppercase text-[var(--ink-faint)]"
                style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "8px" }}
              >
                Totals
              </h3>
              <dl className="divide-y divide-[var(--hairline)]">
                {totals.byType.map((t) => (
                  <div key={`${t.type}:${t.currency}`} className="flex justify-between gap-4 py-2" style={{ fontSize: "14px" }}>
                    <dt className="text-[var(--ink-muted)]">
                      {claimTypeLabel(t.type)} × {t.count}
                    </dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {formatAmount(t.amount, t.currency)}
                    </dd>
                  </div>
                ))}
                {totals.byCurrency.map((c) => (
                  <div key={c.currency} className="flex justify-between gap-4 py-2">
                    <dt className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "15px" }}>
                      Total
                    </dt>
                    <dd className="font-mono tabular-nums font-semibold text-[var(--ink)]" style={{ fontSize: "18px" }}>
                      {formatAmount(c.amount, c.currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-1.5"
              onClick={downloadPdf}
              disabled={pdfBusy || readyLines.length === 0}
            >
              {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pdfBusy ? "Preparing the PDF…" : "Download claim PDF"}
            </Button>
            {pdfError ? <Notice>{pdfError}</Notice> : null}
            <p className="text-[var(--ink-faint)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
              A summary page, then a copy of every receipt with its number.
              Keep the paper originals: your employer may still ask for them.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function without<T extends Record<string, unknown>>(obj: T, key: string): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

/** What "Confirm" saves for a line: every suggestion not saved yet. */
function confirmPatch(line: ClaimLine): ClaimPatch {
  const patch: ClaimPatch = {};
  if (line.suggested.type) patch.claim_type = line.type;
  if (line.suggested.place && line.place) patch.claim_place = line.place;
  if (line.suggested.purpose && line.purpose) patch.claim_purpose = line.purpose;
  return patch;
}

function LineCard({
  line,
  drafts,
  error,
  onType,
  onDraft,
  onCommit,
}: {
  line: ClaimLine;
  drafts: Partial<Record<"place" | "purpose", string>>;
  error: string | null;
  onType: (type: ClaimType) => void;
  onDraft: (key: "place" | "purpose", value: string) => void;
  onCommit: (key: "place" | "purpose") => void;
}) {
  const r = line.receipt;
  const id = r.id;
  const total = r.total == null ? null : Number(r.total);
  return (
    <article
      aria-label={`Line ${line.number}, ${r.merchant_name ?? "receipt"}`}
      className="bg-card"
      style={{
        border: "1px solid var(--hairline)",
        borderLeft: line.ready ? "1px solid var(--hairline)" : "3px solid var(--attention)",
        borderRadius: "12px",
        padding: "12px 14px",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="shrink-0 inline-flex items-center justify-center font-display font-bold text-[var(--ink)] tabular-nums"
          style={{ width: "28px", height: "28px", borderRadius: "9999px", border: "1.5px solid var(--ink)", fontSize: "13px" }}
        >
          {line.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[var(--ink)] truncate" style={{ fontSize: "15px", letterSpacing: "-0.01em" }}>
            {r.merchant_name ?? "Receipt"}
          </p>
          <p className="text-[var(--ink-faint)] tabular-nums" style={{ fontSize: "13px", fontWeight: 500 }}>
            {claimDayLabel(line.date)}
            {line.time ? ` · ${line.time}` : ""}
            {line.ready ? "" : " · Needs review"}
          </p>
        </div>
        <span className="shrink-0 font-mono tabular-nums text-[var(--ink)]" style={{ fontSize: "18px", fontWeight: 500 }}>
          {formatAmount(total, r.currency)}
        </span>
      </div>

      <div className="mt-3 divide-y divide-[var(--hairline)]" style={{ borderTop: "1px solid var(--hairline)" }}>
        <FieldRow label="Type" htmlFor={`type-${id}`} suggested={line.suggested.type}>
          <select
            id={`type-${id}`}
            className="h-11 w-full bg-transparent text-base md:text-sm text-[var(--ink)] outline-none"
            value={line.type}
            onChange={(e) => onType(e.target.value as ClaimType)}
          >
            {CLAIM_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Place" htmlFor={`place-${id}`} suggested={line.suggested.place && drafts.place === undefined}>
          <input
            id={`place-${id}`}
            className="h-11 w-full bg-transparent text-base md:text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder="Town of the trip"
            maxLength={MAX_CLAIM_PLACE}
            value={drafts.place ?? line.place}
            onChange={(e) => onDraft("place", e.target.value)}
            onBlur={() => onCommit("place")}
          />
        </FieldRow>
        <FieldRow label="Purpose" htmlFor={`purpose-${id}`} suggested={line.suggested.purpose && drafts.purpose === undefined}>
          <input
            id={`purpose-${id}`}
            className="h-11 w-full bg-transparent text-base md:text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder="Meeting, visit, training…"
            maxLength={MAX_CLAIM_PURPOSE}
            value={drafts.purpose ?? line.purpose}
            onChange={(e) => onDraft("purpose", e.target.value)}
            onBlur={() => onCommit("purpose")}
          />
        </FieldRow>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm bg-[var(--attention-tint)] text-[var(--attention-deep)] rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}
    </article>
  );
}

function FieldRow({
  label,
  htmlFor,
  suggested,
  children,
}: {
  label: string;
  htmlFor: string;
  suggested: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 focus-within:outline-2 focus-within:outline-[var(--ring)] rounded-sm" style={{ minHeight: "44px" }}>
      <label htmlFor={htmlFor} className="shrink-0 text-[var(--ink-muted)]" style={{ width: "72px", fontSize: "14px", fontWeight: 600 }}>
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
      {suggested ? (
        <span
          className="shrink-0 uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em" }}
        >
          Suggested
        </span>
      ) : null}
    </div>
  );
}

function MonthLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors"
      style={{ width: "44px", height: "44px", borderRadius: "10px" }}
    >
      {children}
    </Link>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md px-3 py-2 bg-[var(--attention-tint)] text-[var(--attention-deep)]"
      style={{ fontSize: "14px", lineHeight: 1.5 }}
    >
      {children}
    </p>
  );
}
