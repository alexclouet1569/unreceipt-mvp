"use client";

// The month's expense claim: one card per receipt with the type, place and
// purpose an employer's expense form asks for. Values UnReceipt worked out
// are marked "Suggested" until the person saves or confirms them; the
// totals and the PDF follow what's on screen.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAmount, splitFormattedAmount } from "@/lib/receipt-format";
import { useI18n } from "@/lib/i18n/client";
import {
  CLAIM_TYPE_KEYS,
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
  loadError: "load" | "too_many" | null;
};

export function ClaimSheet({
  month,
  prevMonth,
  nextMonth,
  receipts: initialReceipts,
  history,
  loadError,
}: ClaimSheetProps) {
  const { locale, t: messages } = useI18n();
  const t = messages.claims;
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
        setErrors((e) => ({ ...e, [id]: t.saveFailed }));
        return false;
      }
    } catch {
      setErrors((e) => ({ ...e, [id]: messages.common.networkError }));
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
        // The route's own message is in the request's language too.
        setPdfError(res.status === 429 ? t.pdfRateLimited : (body.error ?? t.pdfFailed));
      } else {
        window.location.assign(body.url);
      }
    } catch {
      setPdfError(messages.common.networkError);
    }
    setPdfBusy(false);
  };

  return (
    <div className="space-y-6">
      <nav aria-label={t.monthNav} className="flex items-center justify-between gap-2">
        <MonthLink href={`/app/claims?month=${prevMonth}`} label={t.previousMonth(claimMonthLabel(prevMonth, locale))}>
          <ChevronLeft className="w-5 h-5" />
        </MonthLink>
        <h2
          className="font-display font-bold text-[var(--ink)]"
          style={{ fontSize: "24px", letterSpacing: "-0.02em" }}
        >
          {claimMonthLabel(month, locale)}
        </h2>
        <MonthLink href={`/app/claims?month=${nextMonth}`} label={t.nextMonth(claimMonthLabel(nextMonth, locale))}>
          <ChevronRight className="w-5 h-5" />
        </MonthLink>
      </nav>

      {loadError ? (
        <Notice>{loadError === "too_many" ? t.tooMany : t.loadFailed}</Notice>
      ) : lines.length === 0 ? (
        <p className="text-center text-[var(--ink-muted)]" style={{ fontSize: "15px" }}>
          {t.empty(claimMonthLabel(month, locale))}
        </p>
      ) : (
        <>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            {t.intro}
          </p>

          {toConfirm.length > 0 ? (
            <Button
              type="button"
              className="w-full h-11"
              onClick={confirmAll}
              disabled={confirming}
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {confirming ? messages.common.saving : t.confirm(toConfirm.length)}
            </Button>
          ) : null}

          {pendingCount > 0 ? (
            <Notice>
              {t.pending(pendingCount)}{" "}
              <Link href="/app" className="underline outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                {t.openReceipts}
              </Link>
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
                {t.totals}
              </h3>
              <dl className="divide-y divide-[var(--hairline)]">
                {totals.byType.map((total) => (
                  <div key={`${total.type}:${total.currency}`} className="flex justify-between gap-4 py-2" style={{ fontSize: "14px" }}>
                    <dt className="text-[var(--ink-muted)]">
                      {claimTypeLabel(total.type, locale)} × {total.count}
                    </dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {formatAmount(total.amount, total.currency, locale)}
                    </dd>
                  </div>
                ))}
                {totals.byCurrency.map((c) => (
                  <div key={c.currency} className="flex justify-between gap-4 py-2">
                    <dt className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "15px" }}>
                      {t.total}
                    </dt>
                    <dd className="font-mono tabular-nums font-semibold text-[var(--ink)]" style={{ fontSize: "18px" }}>
                      {formatAmount(c.amount, c.currency, locale)}
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
              {pdfBusy ? t.preparingPdf : t.downloadPdf}
            </Button>
            {pdfError ? <Notice>{pdfError}</Notice> : null}
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
              {t.pdfHint}
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
  const { locale, t: messages } = useI18n();
  const t = messages.claims;
  const r = line.receipt;
  const id = r.id;
  const total = r.total == null ? null : Number(r.total);
  const amount = splitFormattedAmount(total, r.currency, locale);
  const errorId = `claim-error-${id}`;
  return (
    <article
      aria-label={t.line(line.number, r.merchant_name ?? t.receipt)}
      className="bg-card"
      style={{
        border: "1px solid var(--hairline)",
        borderLeft: line.ready ? "1px solid var(--hairline)" : "3px solid var(--attention)",
        borderRadius: "12px",
        // The 3px review rule is 2px wider than the hairline: keep content aligned.
        padding: line.ready ? "12px 14px" : "12px 14px 12px 12px",
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
            {r.merchant_name ?? t.receipt}
          </p>
          <p className="text-[var(--ink-faint)] tabular-nums" style={{ fontSize: "13px", fontWeight: 500 }}>
            {claimDayLabel(line.date, locale)}
            {line.time ? ` · ${line.time}` : ""}
            {line.ready ? null : (
              <>
                <span style={{ margin: "0 6px" }} aria-hidden="true">
                  ·
                </span>
                <span className="font-accent italic" style={{ color: "var(--attention-mint)", fontWeight: 500 }}>
                  {t.needsReview}
                </span>
              </>
            )}
          </p>
        </div>
        <span className="shrink-0 font-mono tabular-nums text-[var(--ink)]" style={{ fontSize: "18px", fontWeight: 500, letterSpacing: "-0.01em" }}>
          {amount.value}
          {amount.suffix ? (
            <span className="text-[var(--ink-faint)]" style={{ fontSize: "11px", marginLeft: "3px" }}>
              {amount.suffix}
            </span>
          ) : null}
        </span>
      </div>

      <div className="mt-3 divide-y divide-[var(--hairline)]" style={{ borderTop: "1px solid var(--hairline)" }}>
        <FieldRow label={t.type} htmlFor={`type-${id}`} suggested={line.suggested.type}>
          <div className="relative">
            <select
              id={`type-${id}`}
              className="h-11 w-full appearance-none bg-transparent pr-6 text-base md:text-sm text-[var(--ink)] outline-none"
              value={line.type}
              onChange={(e) => onType(e.target.value as ClaimType)}
              aria-describedby={describedBy(line.suggested.type, `type-${id}`, error ? errorId : null)}
            >
              {CLAIM_TYPE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {claimTypeLabel(key, locale)}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]"
            />
          </div>
        </FieldRow>
        <FieldRow label={t.place} htmlFor={`place-${id}`} suggested={line.suggested.place && drafts.place === undefined}>
          <input
            id={`place-${id}`}
            className="h-11 w-full bg-transparent text-base md:text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder={t.placePlaceholder}
            maxLength={MAX_CLAIM_PLACE}
            value={drafts.place ?? line.place}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(
              line.suggested.place && drafts.place === undefined,
              `place-${id}`,
              error ? errorId : null,
            )}
            onChange={(e) => onDraft("place", e.target.value)}
            onBlur={() => onCommit("place")}
          />
        </FieldRow>
        <FieldRow label={t.purpose} htmlFor={`purpose-${id}`} suggested={line.suggested.purpose && drafts.purpose === undefined}>
          <input
            id={`purpose-${id}`}
            className="h-11 w-full bg-transparent text-base md:text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder={t.purposePlaceholder}
            maxLength={MAX_CLAIM_PURPOSE}
            value={drafts.purpose ?? line.purpose}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(
              line.suggested.purpose && drafts.purpose === undefined,
              `purpose-${id}`,
              error ? errorId : null,
            )}
            onChange={(e) => onDraft("purpose", e.target.value)}
            onBlur={() => onCommit("purpose")}
          />
        </FieldRow>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm bg-[var(--attention-tint)] text-[var(--attention-deep)] rounded-md px-3 py-2">
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
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 focus-within:outline-2 focus-within:outline-[var(--ring)] rounded-sm" style={{ minHeight: "44px" }}>
      <label htmlFor={htmlFor} className="shrink-0 text-[var(--ink-muted)]" style={{ width: "72px", fontSize: "14px", fontWeight: 600 }}>
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
      {suggested ? (
        <span
          id={`${htmlFor}-suggested`}
          className="shrink-0 uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
        >
          {t.claims.suggested}
        </span>
      ) : null}
    </div>
  );
}

/** Ties a control to its "Suggested" marker and its error, for screen readers. */
function describedBy(suggested: boolean, controlId: string, errorId: string | null): string | undefined {
  const ids = [suggested ? `${controlId}-suggested` : null, errorId].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function MonthLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors duration-100 outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
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
