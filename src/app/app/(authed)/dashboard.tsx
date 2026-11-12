"use client";

import { useCallback, useEffect, useId, useOptimistic, useRef, useState, useMemo, useTransition } from "react";
import { AccountantInviteNotice, type PendingAccountantInvite } from "@/components/AccountantInviteNotice";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Plus, Receipt as ReceiptIcon } from "lucide-react";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import { SwipeToDelete } from "@/components/receipt/SwipeToDelete";
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
import { printedDay, printedMonth } from "@/lib/receipts/printed-day";
import { applyReceiptChange, type ReceiptChange } from "@/lib/receipts/optimistic";
import type { MoneyLine, OlderSummary } from "@/lib/mobile/types";
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
  // Every receipt beyond `receipts` (the newest 50), summed on the server:
  // the stat cards add it to their own list. Null when it couldn't be read.
  older?: OlderSummary | null;
};

type Filter = "all" | "review" | `category:${CategoryKey}`;

// How long a swiped-away receipt can be brought back before it's deleted.
const UNDO_MS = 5000;

// How the list is sectioned: by the receipt's day, or by what it was for.
type View = "date" | "category";

export function Dashboard({
  userEmail,
  receipts: serverReceipts,
  forwardingEmail,
  intakeSmsNumber,
  showOnboarding = false,
  accountantInvites = [],
  homeCurrency,
  older = null,
}: DashboardProps) {
  const router = useRouter();
  // Saved edits and deletes from the receipt dialog show at once; the
  // refresh that follows brings the server's rows, which replace them
  // (src/lib/receipts/optimistic.ts).
  const [allReceipts, applyOptimistic] = useOptimistic(serverReceipts, applyReceiptChange);
  const [, startTransition] = useTransition();
  const [captureOpen, setCaptureOpen] = useState(false);
  // Swipe to delete: the row whose Delete button is showing, receipts
  // already gone from the list, and the last one deleted, which can be
  // brought back for UNDO_MS before the server deletes it for good.
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Receipt | null>(null);
  const pendingRef = useRef<{ receipt: Receipt; timer: ReturnType<typeof setTimeout> } | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const receipts = useMemo(
    () => (deletedIds.size ? allReceipts.filter((r) => !deletedIds.has(r.id)) : allReceipts),
    [allReceipts, deletedIds],
  );

  const restore = useCallback((id: string) => {
    setDeletedIds((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }, []);

  // Sends the delete for the receipt waiting out its undo time, if any.
  // keepalive lets it finish when the page is closing.
  const commitDelete = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setPendingDelete(null);
    const { receipt } = pending;
    fetch(`/api/receipts/${receipt.id}`, { method: "DELETE", keepalive: true })
      .then((res) => {
        if (!res.ok) throw new Error(`delete failed (HTTP ${res.status})`);
        router.refresh();
      })
      .catch((err) => {
        console.error("[/app] swipe delete failed", err);
        restore(receipt.id);
        setDeleteError(`Couldn't delete ${receipt.merchant_name ?? "this receipt"}. It's back in the list; try again in a moment.`);
      });
  }, [router, restore]);

  // The row disappears at once; the server deletes it after UNDO_MS (same
  // route as the detail view's Delete, so its stored files go too), or as
  // soon as the app goes to the background or another receipt is deleted.
  const deleteReceipt = (receipt: Receipt) => {
    commitDelete();
    const deleteHadFocus = document.activeElement?.closest?.("button[aria-label^='Delete receipt']") != null;
    setSwipedId(null);
    setDeleteError(null);
    setDeletedIds((ids) => new Set(ids).add(receipt.id));
    pendingRef.current = { receipt, timer: setTimeout(commitDelete, UNDO_MS) };
    setPendingDelete(receipt);
    // The focused Delete button is gone: keyboard and VoiceOver users land
    // on Undo instead of the top of the page.
    if (deleteHadFocus) requestAnimationFrame(() => undoButtonRef.current?.focus());
  };

  const changeReceipt = (change: ReceiptChange, commit?: () => Promise<void>) => {
    setDeleteError(null);
    startTransition(async () => {
      applyOptimistic(change.kind === "update" ? { ...change, homeCurrency: homeCurrency ?? null } : change);
      try {
        await commit?.();
        // The refresh joins this transition, so React keeps the shown change
        // until the server's rows commit: no flash of the old values, and no
        // wait of our own that would hold other navigations back.
        router.refresh();
      } catch (err) {
        // The transition ends, so the receipt comes back by itself.
        console.error("[/app] receipt change failed", err);
        const name = serverReceipts.find((r) => r.id === change.id)?.merchant_name ?? "this receipt";
        setDeleteError(`Couldn't delete ${name}. It's back in the list; try again in a moment.`);
      }
    });
  };

  const undoDelete = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setPendingDelete(null);
    restore(pending.receipt.id);
  };

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") commitDelete();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", commitDelete);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", commitDelete);
      commitDelete();
    };
  }, [commitDelete]);

  useEffect(() => {
    if (deleteError) errorRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [deleteError]);
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
  const [chosenFilter, setFilter] = useState<Filter>("all");
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

  // A category filter whose last receipt was deleted falls back to all.
  const filter: Filter =
    chosenFilter.startsWith("category:") &&
    !receipts.some((r) => `category:${r.category}` === chosenFilter)
      ? "all"
      : chosenFilter;

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
    // The list holds the newest 50; `older` counts the rest.
    const count = receipts.length + (older?.count ?? 0);
    const verified = receipts.filter((r) => r.status === "verified").length + (older?.verified ?? 0);
    if (!today) {
      return { baseCurrency, count, verified, periods: null, selected: null, totals: null };
    }
    // This month, then every month that has a receipt, newest first, then
    // all time. A month in another year carries the year.
    const current = monthKey(today.year, today.index);
    const keys = new Set<string>([current, ...Object.keys(older?.months ?? {})]);
    for (const r of receipts) {
      const k = receiptMonthKey(r);
      if (k) keys.add(k);
    }
    const periods = [
      ...[...keys].sort().reverse().map((key) => ({ key, ...monthLabels(key, today.year) })),
      { key: "all", label: "All time", short: "All time" },
    ];
    const selected = periods.find((p) => p.key === (period ?? current)) ?? periods[0];
    // In the company's currency; a receipt not converted yet stays apart
    // (DESIGN.md, 2026-11-05).
    const own = sumLines(
      selected.key === "all" ? receipts : receipts.filter((r) => receiptMonthKey(r) === selected.key),
    );
    const rest = (selected.key === "all" ? older?.all : older?.months[selected.key]) ?? [];
    const totals = formatLines(mergeLines(own, rest, baseCurrency));
    return { baseCurrency, count, verified, periods, selected, totals };
  }, [receipts, homeCurrency, today, period, older]);

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
      const label = relativeDayGroup(printedDay(r));
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
    // The header and tabs come from the (authed) layout (AppNav).
    <div>
      {/* Room at the bottom for the capture button (and the tab bar under it
          on a phone): --fab-bottom in globals.css. */}
      <div className="mx-auto max-w-[540px] px-4 py-6 pb-[calc(var(--fab-bottom)+88px)]">
        <div className="mb-6">
          <h1 className="type-display-lg text-[var(--ink)]">Your receipts</h1>
          <p className="mt-0.5 type-caption text-[var(--ink-muted)]">{userEmail}</p>
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
          <div className="list-enter">
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard label="Receipts" lines={[String(stats.count)]} />
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

            {deleteError ? (
              <p
                ref={errorRef}
                role="alert"
                className="mb-3 rounded-[10px] bg-[var(--attention-tint)] px-3 py-2 text-[14px] font-semibold text-[var(--attention-deep)]"
              >
                {deleteError}
              </p>
            ) : null}

            {filter === "review" && visibleReceipts.length === 0 ? (
              <p className="py-8 text-center type-caption font-normal text-[var(--ink-muted)]">
                Nothing to review — every receipt has the fields it needs.
              </p>
            ) : null}

            {groupedReceipts.map(({ label, items, total }) => (
              <section key={label} className="mb-5">
                <h2 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 type-micro text-[var(--ink-muted)]">
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
                    <SwipeToDelete
                      key={r.id}
                      open={swipedId === r.id}
                      onOpenChange={(o) => setSwipedId(o ? r.id : null)}
                      onDelete={() => void deleteReceipt(r)}
                      label={`${r.merchant_name ?? "Unknown merchant"}, ${formatAmount(r.total, r.currency)}`}
                    >
                      <ReceiptListItem receipt={r} onClick={() => setOpenReceipt(r)} />
                    </SwipeToDelete>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {onboardingStep == null ? (
        <CaptureFab onClick={() => setCaptureOpen(true)} />
      ) : null}

      {/* Always in the DOM so VoiceOver announces the change. */}
      <div
        role="status"
        className={
          pendingDelete
            // Above the capture button, under any open sheet (dialogs are z-50).
            ? "fixed bottom-[calc(var(--fab-bottom)+80px)] left-1/2 z-40 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-[12px] border border-[var(--hairline)] bg-card py-1.5 pr-1.5 pl-4 text-[14px] font-semibold text-[var(--ink)]"
            : "sr-only"
        }
      >
        {pendingDelete ? (
          <>
            <span className="min-w-0 truncate">Deleted {pendingDelete.merchant_name ?? "receipt"}</span>
            <button
              ref={undoButtonRef}
              type="button"
              onClick={undoDelete}
              className="h-11 shrink-0 rounded-[10px] px-3 font-bold text-[var(--brand-action)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Undo
            </button>
          </>
        ) : null}
      </div>

      <CaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onSaved={() => {
          if (onboardingStep === 2) setOnboardingStep(3);
        }}
      />
      <ReceiptDetailDialog
        receipt={openReceipt}
        onChangeAction={changeReceipt}
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
        className="font-accent italic text-[var(--ink-muted)]"
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

/** The month a receipt was bought in ("2026-10"), as printed on it (printed-day.ts). */
function receiptMonthKey(r: Receipt): string | null {
  return printedMonth(r);
}

/**
 * "October" in the picker and on the card; another year's month is
 * "October 2025" in the picker but "Oct 2025" on the narrow card, so the
 * year never gets cut off (a card is ~95px wide at 390px).
 */
function monthLabels(key: string, currentYear: number): { label: string; short: string } {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  const long = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(date);
  if (y === currentYear) return { label: long, short: long };
  const short = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
  return { label: `${long} ${y}`, short: `${short} ${y}` };
}

type Period = { key: string; label: string; short: string };

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
  periods: Period[];
  selected: Period;
  onSelect: (key: string) => void;
  lines: string[];
}) {
  const amountId = useId();
  return (
    // Ring only for keyboard focus: after a tap iOS keeps the select
    // focused, and a lingering green ring would be a second green element.
    <Card className="relative has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-[var(--ring)]">
      <CardContent className="py-3 px-2 text-center">
        <div id={amountId} aria-live="polite">
          {lines.map((line) => (
            <div
              key={line}
              // Totals grow ("All time" in kronor): step down rather than
              // cut digits off, as the capture sheet does for long amounts.
              className={
                "font-medium tabular-nums whitespace-nowrap font-mono " +
                (line.length > 11 ? "text-[12px] leading-5" : "text-sm")
              }
            >
              {line}
            </div>
          ))}
        </div>
        {/* The select announces the period itself, so this is visual only. */}
        <div
          className="text-xs text-muted-foreground flex w-full min-w-0 items-center justify-center gap-0.5"
          aria-hidden="true"
        >
          <span className="truncate">{selected.short}</span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </div>
      </CardContent>
      <select
        aria-label="Total for period"
        aria-describedby={amountId}
        value={selected.key}
        onChange={(e) => onSelect(e.target.value)}
        // 16px keeps iOS from zooming the page when the picker opens.
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none text-[16px]"
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
 * The receipts' total per currency: foreign receipts count with their
 * amount in the company's currency (home_total, src/lib/fx.ts). Only a
 * receipt that couldn't be converted yet is listed apart, never added in.
 * `estimate`: the sum includes an ECB-rate conversion ("≈").
 */
function sumLines(items: Receipt[]): MoneyLine[] {
  const sums = new Map<string, MoneyLine>();
  for (const r of items) {
    const converted = r.home_total != null && r.home_currency != null;
    const amount = converted ? r.home_total : r.total;
    const currency = converted ? (r.home_currency as string) : r.currency;
    if (amount == null) continue;
    const line = sums.get(currency) ?? { amount: 0, currency, estimate: false };
    line.amount += amount;
    if (converted && r.fx_source === "ecb" && r.currency !== r.home_currency) line.estimate = true;
    sums.set(currency, line);
  }
  return [...sums.values()];
}

/** Two lists of sums added up, the company's currency first; zero sums dropped. */
function mergeLines(a: MoneyLine[], b: MoneyLine[], home: string): MoneyLine[] {
  const sums = new Map<string, MoneyLine>();
  for (const l of [...a, ...b]) {
    const line = sums.get(l.currency) ?? { amount: 0, currency: l.currency, estimate: false };
    line.amount += l.amount;
    line.estimate ||= l.estimate;
    sums.set(l.currency, line);
  }
  return [...sums.values()]
    .filter((l) => l.amount !== 0)
    .sort((x, y) => (x.currency === home ? -1 : y.currency === home ? 1 : 0));
}

/** "≈ 1,245.00 kr + €18.50", or "" for nothing. */
function formatLines(lines: MoneyLine[]): string {
  return lines
    .map((l) => (l.estimate ? "≈ " : "") + formatAmount(Math.round(l.amount * 100) / 100, l.currency))
    .join(" + ");
}

/** "1,245.00 kr + €18.50" for a list of receipts. */
function sumByCurrency(items: Receipt[]): string {
  return formatLines(sumLines(items));
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
