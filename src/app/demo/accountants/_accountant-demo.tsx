"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Download, FileUp } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { MerchantLogo } from "@/components/receipt/MerchantLogo";
import { Amount } from "@/components/accountant/Amount";
import { ReminderPreview } from "@/components/accountant/ReminderPreview";
import { StatementLineRow, shortDate } from "@/components/accountant/StatementLineRow";
import { formatAmount } from "@/lib/receipt-format";
import { buildReconciliationCsv } from "@/lib/reconcile/csv";
import {
  reconcile,
  type LineOverride,
  type LineStatus,
  type MatchableReceipt,
  type Reconciliation,
} from "@/lib/reconcile/match";
import {
  StatementParseError,
  decodeStatementFile,
  parseStatement,
  type ParsedStatement,
} from "@/lib/reconcile/parse-statement";
import { buildReminderEmail, periodLabel, type ReminderLocale } from "@/lib/reconcile/reminder";
import { DEMO_CLIENTS, DEMO_FIRM, DEMO_PERIOD, type DemoClient } from "./_fixtures";

type ClientState = {
  overrides: Record<string, LineOverride>;
  locale: ReminderLocale;
  composing: boolean;
  sentAt: string | null;
  replied: boolean;
};

const initialState = (): Record<string, ClientState> =>
  Object.fromEntries(
    DEMO_CLIENTS.map((c) => [
      c.id,
      { overrides: {}, locale: "sv", composing: false, sentAt: null, replied: false },
    ]),
  );

const receiptsFor = (c: DemoClient, s: ClientState) => (s.replied ? [...c.receipts, ...c.replies] : c.receipts);

const MONTH = periodLabel(DEMO_PERIOD, "en");

export function AccountantDemo() {
  const [state, setState] = useState(initialState);
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(
    () =>
      Object.fromEntries(
        DEMO_CLIENTS.map((c) => {
          const s = state[c.id];
          return [c.id, reconcile(c.statement, receiptsFor(c, s), { overrides: s.overrides, formatAmount })];
        }),
      ) as Record<string, Reconciliation>,
    [state],
  );

  // Switching view unmounts the button that had focus: move focus to the new
  // heading (or back to the client's card) and start at the top.
  const lastOpened = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo(0, 0);
    if (openId) document.getElementById("view-title")?.focus();
    else if (lastOpened.current) {
      document.querySelector<HTMLElement>(`[data-client="${lastOpened.current}"]`)?.focus();
    }
  }, [openId]);

  const openClient = (id: string) => {
    lastOpened.current = id;
    setOpenId(id);
  };

  const update = (id: string, patch: Partial<ClientState>) =>
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const open = DEMO_CLIENTS.find((c) => c.id === openId);

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <div className="mx-auto w-full px-4 pb-16 sm:px-6" style={{ maxWidth: "640px" }}>
        <header className="flex items-center justify-between gap-3" style={{ padding: "12px 0" }}>
          <Wordmark variant="horizontal" style={{ fontSize: "20px" }} />
          <span
            className="uppercase text-[var(--ink-muted)]"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              border: "1px solid var(--hairline)",
              borderRadius: "9999px",
              padding: "4px 12px",
            }}
          >
            Demo · sample data
          </span>
        </header>

        {open ? (
          <ClientView
            client={open}
            state={state[open.id]}
            result={results[open.id]}
            onBack={() => setOpenId(null)}
            onChange={(patch) => update(open.id, patch)}
          />
        ) : (
          <FirmOverview results={results} onOpen={openClient} />
        )}
      </div>
    </main>
  );
}

// ─── Firm overview ──────────────────────────────────────────────────────────

function FirmOverview({
  results,
  onOpen,
}: {
  results: Record<string, Reconciliation>;
  onOpen: (id: string) => void;
}) {
  const total = (key: "matched" | "check" | "missing") =>
    DEMO_CLIENTS.reduce((n, c) => n + results[c.id].summary[key], 0);

  return (
    <>
      <section style={{ paddingTop: "16px" }}>
        <MicroLabel>{DEMO_FIRM} · {DEMO_CLIENTS.length} clients</MicroLabel>
        <h1 style={{ fontSize: "32px", lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 700, marginTop: "4px" }}>
          {MONTH}
        </h1>
        <p className="font-accent italic text-[var(--ink-muted)]" style={{ fontSize: "14px", marginTop: "4px" }}>
          Every client&apos;s bank statement, matched against the receipts they sent to UnReceipt.
        </p>
        <dl className="grid grid-cols-3 gap-2" style={{ marginTop: "16px" }}>
          <Stat label="Matched" value={total("matched")} />
          <Stat label="To check" value={total("check")} />
          <Stat label="Missing" value={total("missing")} attention={total("missing") > 0} />
        </dl>
      </section>

      <section style={{ marginTop: "24px" }} aria-labelledby="clients-heading">
        <MicroLabel as="h2" id="clients-heading">Clients</MicroLabel>
        <ul className="flex flex-col gap-2" style={{ marginTop: "8px" }}>
          {DEMO_CLIENTS.map((c) => (
            <li key={c.id}>
              <ClientCard client={c} result={results[c.id]} onOpen={() => onOpen(c.id)} />
            </li>
          ))}
        </ul>
      </section>

      <TryYourFile />

      <section style={{ marginTop: "32px" }} aria-labelledby="how-heading">
        <MicroLabel as="h2" id="how-heading">How it works</MicroLabel>
        <ol className="flex flex-col gap-3" style={{ marginTop: "8px", fontSize: "15px" }}>
          {[
            "Your clients forward email receipts to their own UnReceipt address, or photograph paper ones. We read the shop, amount, date and VAT.",
            "Once a month you add the client's bank statement (a CSV export from the bank).",
            "Every purchase is matched to its receipt. For the ones without, the client gets one email listing exactly what's missing. They reply with photos, and the lines match themselves.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="flex shrink-0 items-center justify-center tabular-nums bg-card"
                style={{ width: "28px", height: "28px", borderRadius: "9999px", border: "1px solid var(--hairline)", fontSize: "13px", fontWeight: 700 }}
              >
                {i + 1}
              </span>
              <span className="text-[var(--ink-muted)]" style={{ paddingTop: "3px" }}>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function ClientCard({ client, result, onOpen }: { client: DemoClient; result: Reconciliation; onOpen: () => void }) {
  const { matched, check, missing, needReceipt } = result.summary;
  const pct = needReceipt === 0 ? 100 : Math.round((matched / needReceipt) * 100);
  const status =
    missing > 0
      ? { text: `${missing} missing`, color: "var(--attention-deep)" }
      : check > 0
        ? { text: `${check} to check`, color: "var(--ink)" }
        : { text: "All set", color: "var(--ink-muted)" };

  return (
    <button
      type="button"
      onClick={onOpen}
      data-client={client.id}
      className="w-full bg-card text-left transition-transform duration-[120ms] ease-out active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
      style={{
        border: "1px solid var(--hairline)",
        borderLeft: missing > 0 ? "3px solid var(--attention)" : "1px solid var(--hairline)",
        borderRadius: "12px",
        padding: "12px 14px",
        paddingLeft: missing > 0 ? "12px" : "14px",
      }}
    >
      <span className="flex items-center gap-3">
        <MerchantLogo merchant={client.name} size={40} radius={10} logo={false} />
        <span className="block min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="block truncate" style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em" }}>
              {client.name}
            </span>
            <span className="flex shrink-0 items-center gap-1" style={{ fontSize: "13px", fontWeight: 600, color: status.color }}>
              {missing === 0 && check === 0 ? <Check size={14} strokeWidth={2.5} aria-hidden="true" /> : null}
              {status.text}
            </span>
          </span>
          <span className="block truncate text-[var(--ink-faint)]" style={{ fontSize: "13px", fontWeight: 500, marginTop: "2px" }}>
            {client.kind} · <span className="tabular-nums">{matched} of {needReceipt}</span> matched
          </span>
        </span>
      </span>
      <span
        className="block overflow-hidden"
        style={{ height: "4px", borderRadius: "9999px", background: "var(--hairline)", marginTop: "12px" }}
        aria-hidden="true"
      >
        <span className="block" style={{ width: `${pct}%`, height: "100%", background: "var(--ink-muted)" }} />
      </span>
    </button>
  );
}

// ─── One client ─────────────────────────────────────────────────────────────

const SECTIONS: { status: LineStatus; title: string; collapsed?: boolean }[] = [
  { status: "missing", title: "Missing a receipt" },
  { status: "check", title: "To check" },
  { status: "matched", title: "Matched" },
  { status: "no_receipt", title: "No receipt needed", collapsed: true },
  { status: "money_in", title: "Money in", collapsed: true },
];

function ClientView({
  client,
  state,
  result,
  onBack,
  onChange,
}: {
  client: DemoClient;
  state: ClientState;
  result: Reconciliation;
  onBack: () => void;
  onChange: (patch: Partial<ClientState>) => void;
}) {
  const receipts = receiptsFor(client, state);
  const byId = new Map(receipts.map((r) => [r.id, r]));
  const arrived = new Set(state.replied ? client.replies.map((r) => r.id) : []);
  const missingLines = result.lines.filter((l) => l.status === "missing").map((l) => l.line);
  const { matched, check, missing, needReceipt } = result.summary;

  const email = buildReminderEmail({
    locale: state.locale,
    clientFirstName: client.contactFirstName,
    firmName: DEMO_FIRM,
    period: DEMO_PERIOD,
    missing: missingLines,
  });

  const setOverride = (lineId: string, override: LineOverride | null) => {
    const next = { ...state.overrides };
    if (override) next[lineId] = override;
    else delete next[lineId];
    onChange({ overrides: next });
  };

  const download = () => {
    const csv = buildReconciliationCsv(result.lines, receipts);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${client.id}-${DEMO_PERIOD}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const unmatched = result.unmatchedReceiptIds.map((id) => byId.get(id)).filter((r): r is MatchableReceipt => !!r);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        style={{ minHeight: "44px", fontSize: "14px", fontWeight: 600 }}
      >
        <ArrowLeft size={16} aria-hidden="true" /> All clients
      </button>

      <section>
        <MicroLabel>{client.kind} · {MONTH}</MicroLabel>
        <h1
          id="view-title"
          tabIndex={-1}
          className="outline-none"
          style={{ fontSize: "24px", lineHeight: 1.15, letterSpacing: "-0.02em", fontWeight: 700, marginTop: "4px" }}
        >
          {client.name}
        </h1>
        <p className="text-[var(--ink-muted)] tabular-nums" style={{ fontSize: "14px", marginTop: "4px" }}>
          {needReceipt} purchases need a receipt: {matched} matched, {check} to check, {missing} missing.
        </p>
      </section>

      <section style={{ marginTop: "16px" }}>
        {missing > 0 && !state.sentAt && !state.composing ? (
          <PrimaryButton onClick={() => onChange({ composing: true })}>
            Ask {client.contactFirstName} for {missing === 1 ? "1 receipt" : `${missing} receipts`}
          </PrimaryButton>
        ) : null}

        {state.composing && !state.sentAt ? (
          <div className="flex flex-col gap-3">
            <ReminderPreview
              email={email}
              to={`${client.contactFirstName} <${client.contactEmail}>`}
              replyTo={client.forwardingAddress}
              locale={state.locale}
              onLocaleChange={(locale) => onChange({ locale })}
            />
            <p className="font-accent italic text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
              Replies go straight to {client.contactFirstName}&apos;s UnReceipt address, so every photo is read and matched
              without anyone typing it in.
            </p>
            <div className="flex gap-2">
              <PrimaryButton onClick={() => onChange({ sentAt: new Date().toISOString() })}>Send reminder</PrimaryButton>
              <SecondaryButton onClick={() => onChange({ composing: false })}>Cancel</SecondaryButton>
            </div>
          </div>
        ) : null}

        {state.sentAt && !state.replied ? (
          <Notice>
            <p style={{ fontWeight: 600 }}>
              Reminder sent at{" "}
              {new Date(state.sentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
            </p>
            <p className="text-[var(--ink-muted)]" style={{ marginTop: "2px" }}>
              This is a demo, so no email left this page. In the product, unanswered reminders go out again after a few
              days.
            </p>
            <div style={{ marginTop: "12px" }}>
              <SecondaryButton onClick={() => onChange({ replied: true })}>
                Show {client.contactFirstName}&apos;s reply
              </SecondaryButton>
            </div>
          </Notice>
        ) : null}

        {state.replied ? (
          <Notice>
            <p style={{ fontWeight: 600 }}>
              {client.contactFirstName} replied with {client.replies.length === 1 ? "1 photo" : `${client.replies.length} photos`}.
            </p>
            {client.replyNote ? (
              <p className="font-accent italic text-[var(--ink-muted)]" style={{ marginTop: "2px" }}>
                “{client.replyNote}”
              </p>
            ) : null}
            <p className="text-[var(--ink-muted)]" style={{ marginTop: "2px" }}>
              {missing === 0 ? "Every purchase now has its receipt." : `${missing} still missing. Mark it below if it was private or needs no receipt.`}
            </p>
          </Notice>
        ) : null}

        {missing === 0 && !state.replied ? (
          <Notice>
            <p style={{ fontWeight: 600 }}>Nothing missing for {MONTH}.</p>
          </Notice>
        ) : null}
      </section>

      {SECTIONS.map(({ status, title, collapsed }) => {
        const items = result.lines.filter((l) => l.status === status);
        if (items.length === 0) return null;
        const list = (
          <ul className="bg-card divide-y divide-[var(--hairline)]" style={{ border: "1px solid var(--hairline)", borderRadius: "12px", overflow: "hidden", marginTop: "8px" }}>
            {items.map((item) => (
              <StatementLineRow
                key={item.line.id}
                item={item}
                receipt={item.receiptId ? byId.get(item.receiptId) : undefined}
                arrived={item.receiptId ? arrived.has(item.receiptId) : false}
                onOverride={status === "money_in" ? undefined : (o) => setOverride(item.line.id, o)}
              />
            ))}
          </ul>
        );
        return (
          <section key={status} style={{ marginTop: "24px" }}>
            {collapsed ? (
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[var(--ink-faint)] [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={14} aria-hidden="true" className="transition-transform group-open:rotate-90" />
                  <MicroLabel as="h2">
                    {title} · <span className="tabular-nums">{items.length}</span>
                  </MicroLabel>
                </summary>
                {list}
              </details>
            ) : (
              <>
                <MicroLabel as="h2">
                  {title} · <span className="tabular-nums">{items.length}</span>
                </MicroLabel>
                {list}
              </>
            )}
          </section>
        );
      })}

      {unmatched.length > 0 ? (
        <section style={{ marginTop: "24px" }}>
          <MicroLabel as="h2">Receipts not on this statement · {unmatched.length}</MicroLabel>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", marginTop: "4px" }}>
            Paid in cash, by private card or from another account. Worth a question: they may be an outlay to pay back.
          </p>
          <ul className="bg-card divide-y divide-[var(--hairline)]" style={{ border: "1px solid var(--hairline)", borderRadius: "12px", marginTop: "8px" }}>
            {unmatched.map((r) => (
              <li key={r.id} className="flex items-center gap-3" style={{ padding: "12px 14px" }}>
                <MerchantLogo merchant={r.merchant_name ?? "?"} size={28} radius={6} />
                <p className="min-w-0 flex-1 truncate" style={{ fontSize: "14px", fontWeight: 600 }}>
                  {r.merchant_name}
                  <span className="text-[var(--ink-faint)]" style={{ fontWeight: 500 }}>
                    {" "}
                    · {r.receipt_date ? shortDate(r.receipt_date) : ""}
                  </span>
                </p>
                {r.total != null ? <Amount value={r.total} currency={r.currency} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ marginTop: "32px" }}>
        <SecondaryButton onClick={download}>
          <Download size={16} aria-hidden="true" /> Download reconciliation (CSV)
        </SecondaryButton>
        <p className="text-[var(--ink-faint)]" style={{ fontSize: "13px", marginTop: "8px" }}>
          One row per bank line with its receipt. The receipts themselves come in the month&apos;s ZIP export.
        </p>
      </section>
    </>
  );
}

// ─── Try your own file ─────────────────────────────────────────────────────

const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

function TryYourFile() {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ name: string; data: ParsedStatement; result: Reconciliation } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File) => {
    setError(null);
    setParsed(null);
    // A month's statement is a few hundred kB at most.
    if (file.size > MAX_STATEMENT_BYTES) {
      setError("That file is too large for a bank statement. Export a single month as CSV.");
      return;
    }
    try {
      const data = parseStatement(decodeStatementFile(await file.arrayBuffer()));
      setParsed({ name: file.name, data, result: reconcile(data.lines, [], { formatAmount }) });
    } catch (err) {
      setError(err instanceof StatementParseError ? err.message : "Couldn't read that file. Is it a CSV export?");
    }
  };

  return (
    <section style={{ marginTop: "32px" }} aria-labelledby="try-heading">
      <MicroLabel as="h2" id="try-heading">Try a real bank export</MicroLabel>
      <div className="bg-card" style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px", marginTop: "8px" }}>
        <p style={{ fontSize: "15px", fontWeight: 600 }}>Does it read your bank&apos;s file?</p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", marginTop: "2px" }}>
          Pick a statement exported as CSV. It&apos;s read here in your browser; nothing is uploaded or saved.
        </p>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file);
            e.target.value = "";
          }}
        />
        <div style={{ marginTop: "12px" }}>
          <SecondaryButton onClick={() => input.current?.click()}>
            <FileUp size={16} aria-hidden="true" /> Choose a CSV file
          </SecondaryButton>
        </div>

        {error ? (
          <p
            role="alert"
            className="text-[var(--attention-deep)]"
            style={{ marginTop: "12px", fontSize: "14px", background: "var(--attention-tint)", borderRadius: "10px", padding: "8px 12px" }}
          >
            {error}
          </p>
        ) : null}

        {parsed ? (
          <div aria-live="polite" style={{ marginTop: "12px", fontSize: "14px" }}>
            <p style={{ fontWeight: 600 }}>
              Read <span className="tabular-nums">{parsed.data.lines.length}</span> lines from {parsed.name}.
            </p>
            <p className="text-[var(--ink-muted)]" style={{ marginTop: "2px" }}>
              Columns used: “{parsed.data.columns.date}”, “{parsed.data.columns.text}”, “{parsed.data.columns.amount}”.{" "}
              <span className="tabular-nums">{parsed.result.summary.needReceipt}</span> purchases would need a receipt,{" "}
              <span className="tabular-nums">{parsed.result.summary.noReceipt}</span> need none (tax, salary, fees, transfers),{" "}
              <span className="tabular-nums">{parsed.result.summary.moneyIn}</span> are money in.
              {parsed.data.skipped.length > 0
                ? ` ${parsed.data.skipped.length} rows skipped (${parsed.data.skipped
                    .slice(0, 3)
                    .map((s) => `row ${s.row}: ${s.reason.toLowerCase()}`)
                    .join("; ")}${parsed.data.skipped.length > 3 ? "…" : ""}).`
                : ""}
            </p>
            {parsed.result.lines.length > 0 ? (
              <ul
                className="bg-card divide-y divide-[var(--hairline)]"
                style={{ border: "1px solid var(--hairline)", borderRadius: "12px", overflow: "hidden", marginTop: "12px" }}
              >
                {parsed.result.lines.slice(0, 8).map((item) => (
                  <StatementLineRow key={item.line.id} item={item} />
                ))}
              </ul>
            ) : null}
            {parsed.result.lines.length > 8 ? (
              <p className="text-[var(--ink-faint)]" style={{ fontSize: "13px", marginTop: "8px" }}>
                First 8 of {parsed.result.lines.length} lines. There are no receipts in this demo to match them against.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─── Small parts ────────────────────────────────────────────────────────────

function MicroLabel({ children, id, as: Tag = "p" }: { children: React.ReactNode; id?: string; as?: "p" | "span" | "h2" }) {
  return (
    <Tag id={id} className="uppercase text-[var(--ink-faint)]" style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}>
      {children}
    </Tag>
  );
}

function Stat({ label, value, attention }: { label: string; value: number; attention?: boolean }) {
  return (
    <div className="bg-card" style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}>
      <dt className="text-[var(--ink-muted)]" style={{ fontSize: "13px", fontWeight: 500 }}>
        {label}
      </dt>
      <dd
        className="tabular-nums"
        style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.02em", color: attention ? "var(--attention-deep)" : "var(--ink)" }}
      >
        {value}
      </dd>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="bg-card" style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px" }}>
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-[var(--brand-action-deep)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
      style={{ minHeight: "44px", padding: "0 16px", borderRadius: "10px", fontSize: "15px", fontWeight: 700 }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 bg-card text-[var(--ink)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
      style={{ minHeight: "44px", padding: "0 14px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, border: "1px solid var(--hairline)" }}
    >
      {children}
    </button>
  );
}
