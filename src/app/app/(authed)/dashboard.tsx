"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Receipt as ReceiptIcon, Settings } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
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
import { FirstRun, type FirstRunStep } from "./_first-run";

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

  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthIso = monthStart.toISOString().slice(0, 10);

    const baseCurrency = receipts[0]?.currency ?? "EUR";
    const monthTotal = receipts
      .filter((r) => (r.purchased_at ?? r.receipt_date ?? "") >= monthIso)
      .reduce((sum, r) => sum + (r.total ?? 0), 0);
    const verified = receipts.filter((r) => r.status === "verified").length;

    return { baseCurrency, monthTotal, verified };
  }, [receipts]);

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
              <StatCard label="Receipts" value={String(receipts.length)} />
              <StatCard label="Verified" value={String(stats.verified)} />
              <StatCard
                label="This month"
                value={formatAmount(stats.monthTotal, stats.baseCurrency)}
              />
            </div>

            <ViewToggle view={view} onChange={setView} />

            <div
              role="tablist"
              aria-label="Filter receipts"
              className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  className="mb-2 flex items-baseline justify-between gap-3 text-[var(--ink-faint)]"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  <span>
                    {label}
                    {total != null ? (
                      <span className="ml-1.5 font-mono tabular-nums">· {items.length}</span>
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

/** "1,245.00 kr" — or "€18.50 + 245.00 kr" when a group mixes currencies. */
function sumByCurrency(items: Receipt[]): string {
  const sums = new Map<string, number>();
  for (const r of items) {
    if (r.total == null) continue;
    sums.set(r.currency, (sums.get(r.currency) ?? 0) + r.total);
  }
  return Array.from(sums, ([currency, sum]) =>
    formatAmount(Math.round(sum * 100) / 100, currency),
  ).join(" + ");
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const options: Array<{ value: View; label: string }> = [
    { value: "date", label: "By date" },
    { value: "category", label: "By category" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Group receipts"
      className="mb-3 grid grid-cols-2 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1"
    >
      {options.map((o) => {
        const active = view === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={
              active
                ? "h-10 rounded-[6px] border border-[var(--hairline)] bg-card text-[14px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                : "h-10 rounded-[6px] border border-transparent text-[14px] font-semibold text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  attention = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  attention?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors"
      style={{
        height: "36px",
        padding: "0 12px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.02em",
        border: active
          ? attention
            ? "1px solid var(--attention)"
            : "1px solid var(--primary)"
          : "1px solid var(--hairline)",
        background: active
          ? attention
            ? "var(--attention-tint)"
            : "var(--brand-tint, #ECF7E7)"
          : "transparent",
        color: active
          ? attention
            ? "var(--attention-deep)"
            : "var(--ink)"
          : "var(--ink-muted)",
      }}
    >
      <span>{label}</span>
      <span
        className="font-mono tabular-nums"
        style={{
          fontSize: "11px",
          opacity: 0.7,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4 text-center">
        <div className="text-base font-mono font-medium tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
