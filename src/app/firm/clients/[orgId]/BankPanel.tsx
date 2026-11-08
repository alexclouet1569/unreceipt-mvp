"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decodeStatement } from "@/lib/bank/decode";
import { NO_RECEIPT_REASONS } from "@/lib/bank/match";
import { dayLabel, type BankLineView, type BankMonthView } from "@/lib/bank/month";
import { formatAmount } from "@/lib/receipt-format";
import { monthLabel } from "@/lib/firm/client-stats";

// Larger files are refused by the route anyway; say so before uploading.
const MAX_FILE_BYTES = 2_000_000;

const reasonLabel = (key: string) => NO_RECEIPT_REASONS.find((r) => r.key === key)?.label ?? "No receipt needed";

type Notice = { tone: "ok" | "problem"; text: string } | null;

/**
 * The client's bank statement for the month: which payments have a
 * receipt, and the ones that don't, in red. The accountant imports the
 * CSV, links a receipt or marks "no receipt needed", and emails the client
 * the list. Matching itself is automatic (src/lib/bank/match.ts).
 */
export function BankPanel({
  organizationId,
  clientName,
  month,
  bank,
}: {
  organizationId: string;
  clientName: string;
  month: string;
  bank: BankMonthView | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"import" | "remind" | "remove" | string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const base = `/api/firm/clients/${organizationId}/bank`;
  const label = monthLabel(month);

  const call = async (url: string, init: RequestInit): Promise<Record<string, unknown> | null> => {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      setNotice({
        tone: "problem",
        text: typeof body.error === "string" && body.error.length > 3 && !body.error.includes("_")
          ? body.error
          : "Something went wrong. Try again.",
      });
      return null;
    }
    return body;
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    if (file.size > MAX_FILE_BYTES) {
      setNotice({ tone: "problem", text: "The file is too large. Export one month or one quarter at a time." });
      return;
    }
    setBusy("import");
    try {
      const csv = decodeStatement(await file.arrayBuffer());
      const body = await call(`${base}/import`, { method: "POST", body: JSON.stringify({ csv }) });
      if (body) {
        const imported = Number(body.imported ?? 0);
        const duplicates = Number(body.duplicates ?? 0);
        const months = (body.months as string[] | undefined) ?? [];
        const period = body.from && body.to ? ` (${dayLabel(String(body.from))} – ${dayLabel(String(body.to))})` : "";
        const parts = [`Imported ${imported} line${imported === 1 ? "" : "s"}${period}.`];
        if (duplicates > 0) parts.push(`${duplicates} ${duplicates === 1 ? "was" : "were"} already there.`);
        const moneyIn = Number(body.moneyIn ?? 0);
        if (moneyIn > 0) parts.push(`${moneyIn} incoming payment${moneyIn === 1 ? " was" : "s were"} left out: only money out is checked.`);
        if (months.length > 0 && !months.includes(month)) {
          parts.push(`None is dated in ${label}: use the arrows above to open ${monthLabel(months[0])}.`);
        }
        setNotice({ tone: "ok", text: parts.join(" ") });
        router.refresh();
      }
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const decide = async (line: BankLineView, value: string) => {
    if (!value) return;
    setNotice(null);
    setBusy(line.id);
    const [kind, arg] = value.split(":");
    const payload =
      kind === "link"
        ? { action: "link", receiptId: arg }
        : kind === "none"
          ? { action: "no_receipt", reason: arg }
          : { action: "clear" };
    const body = await call(`${base}/lines/${line.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    setBusy(null);
    if (body) router.refresh();
  };

  const remind = async () => {
    setNotice(null);
    setBusy("remind");
    const body = await call(`${base}/remind`, { method: "POST", body: JSON.stringify({ month }) });
    setBusy(null);
    if (body) {
      setNotice({ tone: "ok", text: `Emailed ${clientName} the ${Number(body.lines)} missing receipt${Number(body.lines) === 1 ? "" : "s"}. Replies come to you.` });
      router.refresh();
    }
  };

  const remove = async () => {
    setNotice(null);
    setBusy("remove");
    const body = await call(`${base}?month=${month}`, { method: "DELETE" });
    setBusy(null);
    setConfirmRemove(false);
    if (body) {
      setNotice({ tone: "ok", text: `Removed ${Number(body.removed)} bank line${Number(body.removed) === 1 ? "" : "s"} from ${label}.` });
      router.refresh();
    }
  };

  const importButton = (primary: boolean) => (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="sr-only"
        // The visible button below is the control.
        tabIndex={-1}
        aria-hidden="true"
        id={`bank-file-${organizationId}`}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant={primary ? "default" : "outline"}
        className="h-11 gap-1.5"
        disabled={busy !== null}
        onClick={() => fileRef.current?.click()}
      >
        {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {busy === "import" ? "Importing…" : primary ? "Import bank statement (CSV)" : "Import another file"}
      </Button>
    </>
  );

  const lines = bank?.lines ?? [];
  const out = lines.filter((l) => l.state.kind !== "money_in");
  const missing = out.filter((l) => l.state.kind === "missing");
  const matched = out.filter((l) => l.state.kind === "matched");
  const noReceipt = out.filter((l) => l.state.kind === "no_receipt");

  return (
    <section
      aria-labelledby={`bank-heading-${organizationId}`}
      className="bg-card space-y-4"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id={`bank-heading-${organizationId}`}
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "16px" }}
          >
            Bank statement, {label}
          </h2>
          {bank === null ? (
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
              Couldn&apos;t load the bank lines. Reload the page to try again.
            </p>
          ) : out.length === 0 ? (
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5, maxWidth: "60ch" }}>
              Import {clientName}&apos;s bank statement to see which payments have no receipt. Use the CSV file from
              the internet bank (Swedbank, SEB, Nordea, Handelsbanken…). Receipts are matched by amount and date.
            </p>
          ) : (
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }} data-testid="bank-summary">
              {out.length} payment{out.length === 1 ? "" : "s"} out · {matched.length} with receipt
              {noReceipt.length > 0 ? ` · ${noReceipt.length} no receipt needed` : ""} ·{" "}
              {missing.length > 0 ? (
                <span className="font-semibold text-[var(--negative)]">
                  {missing.length} missing receipt{missing.length === 1 ? "" : "s"} (
                  <span className="font-mono tabular-nums">
                    {bank.missingTotals.map((t) => formatAmount(t.amount, t.currency)).join(" + ")}
                  </span>
                  )
                </span>
              ) : (
                <span className="font-semibold text-[var(--brand-action)]">
                  every payment out has a receipt or a decision
                </span>
              )}
            </p>
          )}
        </div>
        {bank !== null ? <div className="flex flex-wrap gap-2">{importButton(out.length === 0)}</div> : null}
      </div>

      {/* Always mounted, so screen readers announce the text when it changes. */}
      <div role="status" aria-live="polite">
        {notice ? (
          <p
            className={
              notice.tone === "problem"
                ? "rounded-md bg-[var(--attention-tint)] text-[var(--attention-deep)] px-3 py-2"
                : "rounded-md border border-[var(--hairline)] bg-card text-[var(--ink)] px-3 py-2"
            }
            style={{ fontSize: "13px", lineHeight: 1.5 }}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      {missing.length > 0 && bank ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-[var(--negative)]" style={{ fontSize: "14px" }}>
              Missing receipts
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {bank.lastRemindedAt ? (
                <span className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                  Last emailed {dayLabel(bank.lastRemindedAt.slice(0, 10))}
                </span>
              ) : null}
              <Button type="button" className="h-11 gap-1.5" disabled={busy !== null} onClick={remind}>
                {busy === "remind" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Email {clientName} the list
              </Button>
            </div>
          </div>
          {bank.incompleteReceipts > 0 ? (
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
              {bank.incompleteReceipts === 1
                ? "1 receipt of this month has no amount yet, so it can't be matched. Complete it under Review needed first: it may pay one of these."
                : `${bank.incompleteReceipts} receipts of this month have no amount yet, so they can't be matched. Complete them under Review needed first: they may pay some of these.`}
            </p>
          ) : null}
          <ul className="divide-y divide-[var(--hairline)] rounded-[12px] border border-[var(--hairline)]">
            {missing.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2" data-testid="bank-missing-line">
                <span className="text-[var(--ink-muted)] tabular-nums" style={{ fontSize: "13px", minWidth: "6.5rem" }}>
                  {dayLabel(l.bookedOn)}
                </span>
                <span className="flex-1 min-w-[10rem] text-[var(--ink)]" style={{ fontSize: "14px" }}>
                  {l.description || "(no text on the bank line)"}
                </span>
                <span className="font-mono tabular-nums text-[var(--negative)]" style={{ fontSize: "14px" }}>
                  {formatAmount(-l.amount, l.currency)}
                </span>
                <label className="sr-only" htmlFor={`resolve-${l.id}`}>
                  Resolve the payment of {formatAmount(-l.amount, l.currency)} on {dayLabel(l.bookedOn)}
                </label>
                <select
                  id={`resolve-${l.id}`}
                  className="h-11 rounded-md border bg-card px-3 text-base md:text-sm text-[var(--ink)] max-w-full outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value=""
                  disabled={busy !== null}
                  onChange={(e) => decide(l, e.target.value)}
                >
                  <option value="">{busy === l.id ? "Saving…" : "Resolve…"}</option>
                  {bank.linkCandidates.length > 0 ? (
                    <optgroup label="This receipt pays it">
                      {bank.linkCandidates.map((c) => (
                        <option key={c.id} value={`link:${c.id}`}>
                          {(c.merchant ?? "Unknown merchant") + " · " + (c.day ? dayLabel(c.day) : "no date") + " · " + formatAmount(c.total, c.currency)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="No receipt: another document is the verifikation">
                    {NO_RECEIPT_REASONS.map((r) => (
                      <option key={r.key} value={`none:${r.key}`}>
                        {r.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {matched.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-[var(--ink)] min-h-11 flex items-center" style={{ fontSize: "14px", fontWeight: 600 }}>
            With receipt ({matched.length})
          </summary>
          <ul className="divide-y divide-[var(--hairline)] rounded-[12px] border border-[var(--hairline)]">
            {matched.map((l) => (
              <LineRow key={l.id} line={l} busy={busy} onClear={() => decide(l, "clear")}>
                {l.receipt?.merchant ?? "Receipt"}
                {l.state.kind === "matched" && l.state.how === "manual" ? " · linked by hand" : ""}
              </LineRow>
            ))}
          </ul>
        </details>
      ) : null}

      {noReceipt.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-[var(--ink)] min-h-11 flex items-center" style={{ fontSize: "14px", fontWeight: 600 }}>
            No receipt needed ({noReceipt.length})
          </summary>
          <ul className="divide-y divide-[var(--hairline)] rounded-[12px] border border-[var(--hairline)]">
            {noReceipt.map((l) => (
              <LineRow key={l.id} line={l} busy={busy} onClear={() => decide(l, "clear")}>
                {l.state.kind === "no_receipt" ? reasonLabel(l.state.reason) : ""}
              </LineRow>
            ))}
          </ul>
        </details>
      ) : null}

      {out.length > 0 || lines.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
          <span>
            {lines.length - out.length > 0
              ? `${lines.length - out.length} payment${lines.length - out.length === 1 ? "" : "s"} in (not checked).`
              : ""}
          </span>
          {confirmRemove ? (
            <span className="flex flex-wrap items-center gap-2">
              Remove all bank lines of {label}?
              <Button type="button" variant="outline" className="h-11" onClick={() => setConfirmRemove(false)} disabled={busy !== null}>
                Keep
              </Button>
              <Button type="button" variant="destructive" className="h-11" onClick={remove} disabled={busy !== null}>
                {busy === "remove" ? "Removing…" : "Remove"}
              </Button>
            </span>
          ) : (
            <button
              type="button"
              className="underline min-h-11 px-1 rounded-[6px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => setConfirmRemove(true)}
            >
              Wrong file? Remove this month&apos;s bank lines
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function LineRow({
  line,
  busy,
  onClear,
  children,
}: {
  line: BankLineView;
  busy: string | null;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const decided = line.state.kind === "no_receipt" || (line.state.kind === "matched" && line.state.how === "manual");
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
      <span className="text-[var(--ink-muted)] tabular-nums" style={{ fontSize: "13px", minWidth: "6.5rem" }}>
        {dayLabel(line.bookedOn)}
      </span>
      <span className="flex-1 min-w-[10rem] text-[var(--ink)]" style={{ fontSize: "14px" }}>
        {line.description || "(no text on the bank line)"}
        <span className="block text-[var(--ink-muted)]" style={{ fontSize: "12px" }}>
          {children}
        </span>
      </span>
      <span className="font-mono tabular-nums text-[var(--ink)]" style={{ fontSize: "14px" }}>
        {formatAmount(-line.amount, line.currency)}
      </span>
      {decided ? (
        <Button type="button" variant="outline" className="h-11" disabled={busy !== null} onClick={onClear}>
          {busy === line.id ? "Saving…" : "Undo"}
        </Button>
      ) : null}
    </li>
  );
}
