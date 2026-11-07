"use client";

import { useEffect, useState, useMemo } from "react";
import { AccountantInviteNotice, type PendingAccountantInvite } from "@/components/AccountantInviteNotice";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Plus, Receipt as ReceiptIcon, Settings } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import { FilterChip } from "@/components/receipt/FilterChip";
import { CaptureFab } from "@/components/CaptureFab";
import { IntakeRow } from "@/components/IntakeRow";
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  formatAmount,
  relativeDayGroup,
  type CategoryKey,
} from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";
import { CaptureDialog } from "./CaptureDialog";
import { ReceiptDetailDialog } from "./ReceiptDetailDialog";
import { FirstRun, GuideLink, type FirstRunStep } from "./_first-run";

type DashboardProps = {
  userEmail: string;
  receipts: Receipt[];
  // The user's `receipts+<hash>@in.unreceipt.com` forwarding address.
  // Server-component minted/fetched in page.tsx so we never block on the
  // round-trip here.
  forwardingEmail: string;
  // Shared SMS/WhatsApp intake number (step 7). Null when unset so the
  // empty-state degrades to email-only without rendering a dangling label.
  intakeSmsNumber: string | null;
  // First run: no receipts yet and onboarding never finished or skipped.
  showOnboarding?: boolean;
  // Accounting-firm invites waiting for this user's answer.
  accountantInvites?: PendingAccountantInvite[];
  // The company's currency (organizations.currency); "0" this month is
  // shown in it.
  homeCurrency?: string;
};

type Filter = "all" | "review" | `category:${CategoryKey}`;

// How the list is sectioned: by the receipt's day, or by what it was for.
type View = "date" | "category";

export function Dashboard({
  userEmail,
  receipts,
  forwardingEmail,
  intakeSmsNumber,
  showOnboarding = false,
  accountantInvites = [],
  homeCurrency,
}: DashboardProps) {
  const [captureOpen, setCaptureOpen] = useState(false);
  // Once started, onboarding stays until finished — even after the first
  // receipt arrives mid-flow (step 2 → 3).
  const [onboardingStep, setOnboardingStep] = useState<FirstRunStep | null>(
    showOnboarding ? 1 : null,
  );
  const finishOnboarding = () => {
    setOnboardingStep(null);
    // Best effort: if it fails, onboarding shows again next visit while
    // the inbox is still empty — harmless.
    void fetch("/api/profile/onboarded", { method: "POST" }).catch(() => {});
  };
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("date");

  const reviewCount = useMemo(
    () => receipts.filter((r) => r.status === "pending_review").length,
    [receipts],
  );

  // Categories that have receipts, most used first.
  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryKey, number>();
    for (const r of receipts) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return CATEGORY_KEYS.filter((k) => counts.has(k))
      .map((key) => ({ key, count: counts.get(key)! }))
      .sort((a, b) => b.count - a.count);
  }, [receipts]);

  const visibleReceipts = useMemo(() => {
    if (filter === "review") {
      return receipts.filter((r) => r.status === "pending_review");
    }
    if (filter.startsWith("category:")) {
      const key = filter.slice("category:".length);
      return receipts.filter((r) => r.category === key);
    }
    return receipts;
  }, [receipts, filter]);

  // Today's month in the user's own calendar, known only in the browser: the
  // server renders in UTC, so around midnight on the 1st it would name (and
  // total) a different month than the phone, and React would see a mismatch.
  const [today, setToday] = useState<{ year: number; index: number } | null>(null);
  useEffect(() => {
    const now = new Date();
    // One-off after mount: the server can't know the user's month.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday({ year: now.getFullYear(), index: now.getMonth() });
  }, []);
  // Which total the third card shows: a month ("2026-11") or "all". null
  // means "this month", so the default follows the calendar.
  const [period, setPeriod] = useState<string | null>(null);

  const stats = useMemo(() => {
    const baseCurrency = homeCurrency ?? receipts[0]?.currency ?? "EUR";
    const verified = receipts.filter((r) => r.status === "verified").length;
    if (!today) {
      return { baseCurrency, verified, periods: null, selected: null, totals: null };
    }
    // This month, then every month that has a receipt, newest first, then
    // all time. A month in another year carries the year.
    const current = monthKey(today.year, today.index);
    const keys = new Set<string>([current]);
    for (const r of receipts) {
      const k = receiptMonthKey(r);
      if (k) keys.add(k);
    }
    const periods = [
      ...[...keys].sort().reverse().map((key) => ({ key, label: monthLabel(key, today.year) })),
      { key: "all", label: "All time" },
    ];
    const selected = periods.find((p) => p.key === (period ?? current)) ?? periods[0];
    // In the company's currency; a receipt not converted yet stays apart
    // (DESIGN.md, 2026-11-05).
    const totals = sumByCurrency(
      selected.key === "all" ? receipts : receipts.filter((r) => receiptMonthKey(r) === selected.key),
    );
    return { baseCurrency, verified, periods, selected, totals };
  }, [receipts, homeCurrency, today, period]);

  const groupedReceipts = useMemo(() => {
    if (view === "category") {
      const groups = new Map<CategoryKey, typeof receipts>();
      for (const r of visibleReceipts) {
        if (!groups.has(r.category)) groups.set(r.category, []);
        groups.get(r.category)!.push(r);
      }
      return categoryCounts
        .filter(({ key }) => groups.has(key))
        .map(({ key }) => {
          const items = groups.get(key)!;
          return {
            label: CATEGORY_CONFIG[key].label,
            items,
            total: sumByCurrency(items),
          };
        });
    }
    const order = ["Today", "Yesterday", "This week"];
    const groups = new Map<string, typeof receipts>();
    for (const r of visibleReceipts) {
      const label = relativeDayGroup(r.purchased_at ?? r.receipt_date);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(r);
    }
    const keys = Array.from(groups.keys());
    keys.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return keys.map((label) => ({
      label,
      items: groups.get(label)!,
      total: null as string | null,
    }));
  }, [visibleReceipts, view, categoryCounts]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Wordmark />
          <Link
            href="/app/settings"
            aria-label="Settings"
            className="inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors"
            style={{ width: "44px", height: "44px", borderRadius: "10px" }}
          >
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)" }}>
        <div className="mb-6">
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "24px", letterSpacing: "-0.02em" }}
          >
            Your receipts
          </h1>
          <p
            className="text-[var(--ink-muted)]"
            style={{ fontSize: "13px", fontWeight: 500, marginTop: "2px" }}
          >
            {userEmail}
          </p>
        </div>

        <AccountantInviteNotice invites={accountantInvites} />

        {onboardingStep != null ? (
          <FirstRun
            step={onboardingStep}
            forwardingEmail={forwardingEmail}
            onNext={() =>
              setOnboardingStep((s) => (s === 1 ? 2 : 3))
            }
            onCapture={() => setCaptureOpen(true)}
            onFinish={finishOnboarding}
          />
        ) : receipts.length === 0 ? (
          <EmptyState
            forwardingEmail={forwardingEmail}
            intakeSmsNumber={intakeSmsNumber}
            onCapture={() => setCaptureOpen(true)}
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard label="Receipts" lines={[String(receipts.length)]} />
              <StatCard label="Verified" lines={[String(stats.verified)]} />
              {stats.periods && stats.selected ? (
                <PeriodTotalCard
                  periods={stats.periods}
                  selected={stats.selected}
                  onSelect={setPeriod}
                  lines={stats.totals ? stats.totals.split(" + ") : [formatAmount(0, stats.baseCurrency)]}
                />
              ) : (
                // Until the browser knows today's month.
                <StatCard label="This month" lines={["–"]} amount />
              )}
            </div>

            <ViewToggle view={view} onChange={setView} />

            <div
              role="group"
              aria-label="Filter receipts"
              className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <FilterChip
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label="All"
                count={receipts.length}
              />
              {reviewCount > 0 ? (
                <FilterChip
                  active={filter === "review"}
                  onClick={() => setFilter("review")}
                  label="Review needed"
                  count={reviewCount}
                  attention
                />
              ) : null}
              {categoryCounts.length > 1
                ? categoryCounts.map(({ key, count }) => (
                    <FilterChip
                      key={key}
                      active={filter === `category:${key}`}
                      onClick={() =>
                        setFilter((f) =>
                          f === `category:${key}` ? "all" : `category:${key}`,
                        )
                      }
                      label={CATEGORY_CONFIG[key].label}
                      count={count}
                    />
                  ))
                : null}
            </div>

            {filter === "review" && visibleReceipts.length === 0 ? (
              <p
                className="text-[var(--ink-muted)] py-8 text-center"
                style={{ fontSize: "13px" }}
              >
                Nothing to review — every receipt has the fields it needs.
              </p>
            ) : null}

            {groupedReceipts.map(({ label, items, total }) => (
              <section key={label} className="mb-5">
                <h2
                  className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[var(--ink-muted)]"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  <span className="min-w-0 truncate">
                    {label}
                    {total != null ? (
                      <span className="ml-1.5 tabular-nums">· {items.length}</span>
                    ) : null}
                  </span>
                  {total != null ? (
                    <span
                      className="font-mono text-[12px] font-medium tracking-normal text-[var(--ink-muted)] normal-case tabular-nums"
                    >
                      {total}
                    </span>
                  ) : null}
                </h2>
                <div className="space-y-2">
                  {items.map((r) => (
                    <ReceiptListItem
                      key={r.id}
                      receipt={r}
                      onClick={() => setOpenReceipt(r)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {onboardingStep == null ? (
        <CaptureFab onClick={() => setCaptureOpen(true)} />
      ) : null}

      <CaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onSaved={() => {
          if (onboardingStep === 2) setOnboardingStep(3);
        }}
      />
      <ReceiptDetailDialog
        receipt={openReceipt}
        onOpenChange={(open) => {
          if (!open) setOpenReceipt(null);
        }}
      />
    </div>
  );
}

function EmptyState({
  forwardingEmail,
  intakeSmsNumber,
  onCapture,
}: {
  forwardingEmail: string;
  intakeSmsNumber: string | null;
  onCapture: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-2">
      <div
        className="flex items-center justify-center"
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "20px",
          background: "var(--brand-tint, #ECF7E7)",
          marginBottom: "20px",
        }}
        aria-hidden="true"
      >
        <ReceiptIcon className="w-7 h-7 text-[var(--primary)]" />
      </div>
      <h2
        className="font-display font-bold text-[var(--ink)]"
        style={{ fontSize: "22px", letterSpacing: "-0.02em", marginBottom: "8px" }}
      >
        Your inbox is empty
      </h2>
      <p
        className="font-accent italic text-[var(--ink-muted)] max-w-[280px]"
        style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "24px" }}
      >
        {intakeSmsNumber
          ? "Forward email receipts or text us a photo. We'll have them VAT-ready in minutes."
          : "Forward email receipts or snap a paper one. We'll have them VAT-ready in minutes."}
      </p>

      <div className="w-full max-w-[340px] space-y-3" style={{ marginBottom: "20px" }}>
        <IntakeRow
          callout="Forward email receipts to"
          value={forwardingEmail}
          mono
          copyLabel="Copy forwarding address"
        />
        {intakeSmsNumber ? (
          <IntakeRow
            callout="Or text a photo to"
            value={intakeSmsNumber}
            mono
            copyLabel="Copy concierge SMS number"
          />
        ) : null}
        <GuideLink />
      </div>

      <button
        type="button"
        onClick={onCapture}
        className="inline-flex items-center gap-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        style={{ fontSize: "13px", fontWeight: 500 }}
      >
        <Plus className="w-4 h-4" />
        Or capture a paper receipt
      </button>

      <p
        className="font-accent italic text-[var(--ink-faint)]"
        style={{ fontSize: "12px", marginTop: "32px", letterSpacing: "0.02em" }}
      >
        Paper is past.
      </p>
    </div>
  );
}

function monthKey(year: number, index: number): string {
  return `${year}-${String(index + 1).padStart(2, "0")}`;
}

/**
 * The month a receipt was bought in ("2026-10"), in the user's own time
 * zone. purchased_at is a UTC timestamp, so it's read through Date (00:30 on
 * the 1st in Stockholm is still the 31st in UTC); receipt_date is already a
 * plain calendar date.
 */
function receiptMonthKey(r: Receipt): string | null {
  if (r.purchased_at) {
    const d = new Date(r.purchased_at);
    if (!Number.isNaN(d.getTime())) return monthKey(d.getFullYear(), d.getMonth());
  }
  if (r.receipt_date && /^\d{4}-\d{2}/.test(r.receipt_date)) return r.receipt_date.slice(0, 7);
  return null;
}

/** "October", or "October 2025" for a month in another year. */
function monthLabel(key: string, currentYear: number): string {
  const [y, m] = key.split("-").map(Number);
  const name = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(y, m - 1, 1));
  return y === currentYear ? name : `${name} ${y}`;
}

/**
 * The third stat card: the total for a month or for all time. The whole
 * card is a native <select> under the visible text, so a tap opens the
 * phone's own picker (the wheel on iOS) and it works with VoiceOver and the
 * keyboard without a custom menu.
 */
function PeriodTotalCard({
  periods,
  selected,
  onSelect,
  lines,
}: {
  periods: Array<{ key: string; label: string }>;
  selected: { key: string; label: string };
  onSelect: (key: string) => void;
  lines: string[];
}) {
  return (
    <Card className="relative focus-within:ring-2 focus-within:ring-[var(--ring)]">
      <CardContent className="py-3 px-2 text-center">
        {lines.map((line) => (
          <div key={line} className="font-medium tabular-nums whitespace-nowrap font-mono text-sm">
            {line}
          </div>
        ))}
        <div className="text-xs text-muted-foreground inline-flex items-center justify-center gap-0.5 max-w-full">
          <span className="truncate">{selected.label}</span>
          <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
        </div>
      </CardContent>
      <select
        aria-label="Show the total for"
        value={selected.key}
        onChange={(e) => onSelect(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
        // 16px keeps iOS from zooming the page when the picker opens.
        style={{ fontSize: "16px" }}
      >
        {periods.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
    </Card>
  );
}

/**
 * "1,245.00 kr": foreign receipts count with their amount in the company's
 * currency (home_total, src/lib/fx.ts). Only a receipt that couldn't be
 * converted yet is listed apart ("1,245.00 kr + €18.50"), never added in.
 */
function sumByCurrency(items: Receipt[]): string {
  const sums = new Map<string, number>();
  // Currencies whose sum includes an ECB-rate estimate get a "≈".
  const estimated = new Set<string>();
  for (const r of items) {
    const converted = r.home_total != null && r.home_currency != null;
    const amount = converted ? r.home_total : r.total;
    const currency = converted ? (r.home_currency as string) : r.currency;
    if (amount == null) continue;
    sums.set(currency, (sums.get(currency) ?? 0) + amount);
    if (converted && r.fx_source === "ecb" && r.currency !== r.home_currency) estimated.add(currency);
  }
  return Array.from(sums, ([currency, sum]) =>
    (estimated.has(currency) ? "≈ " : "") + formatAmount(Math.round(sum * 100) / 100, currency),
  ).join(" + ");
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const options: Array<{ value: View; label: string }> = [
    { value: "date", label: "By date" },
    { value: "category", label: "By category" },
  ];
  return (
    <div
      role="group"
      aria-label="Group receipts"
      className="mb-3 grid grid-cols-2 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1"
    >
      {options.map((o) => {
        const active = view === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={
              active
                ? "h-11 rounded-[6px] border border-[var(--hairline)] bg-card text-[14px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                : "h-11 rounded-[6px] border border-transparent text-[14px] font-semibold text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Mono only for money (DESIGN.md); one line per currency.
function StatCard({ label, lines, amount = false }: { label: string; lines: string[]; amount?: boolean }) {
  return (
    <Card>
      <CardContent className="py-3 px-2 text-center">
        {lines.map((line) => (
          <div
            key={line}
            className={"font-medium tabular-nums whitespace-nowrap " + (amount ? "font-mono text-sm" : "text-base")}
          >
            {line}
          </div>
        ))}
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
