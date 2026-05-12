"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Copy, LogOut, Plus, Receipt as ReceiptIcon } from "lucide-react";
import { useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase-client";
import { Wordmark } from "@/components/brand/Wordmark";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import { CaptureFab } from "@/components/CaptureFab";
import { cn } from "@/lib/utils";
import { formatAmount, relativeDayGroup } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";
import { CaptureDialog } from "./CaptureDialog";
import { ReceiptDetailDialog } from "./ReceiptDetailDialog";

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
};

type Filter = "all" | "review";

export function Dashboard({
  userEmail,
  receipts,
  forwardingEmail,
  intakeSmsNumber,
}: DashboardProps) {
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const handleLogout = async () => {
    await getSupabaseClient().auth.signOut();
    router.replace("/app/login");
  };

  const reviewCount = useMemo(
    () => receipts.filter((r) => r.status === "pending_review").length,
    [receipts],
  );

  const visibleReceipts = useMemo(() => {
    if (filter === "review") {
      return receipts.filter((r) => r.status === "pending_review");
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
    return keys.map((label) => ({ label, items: groups.get(label)! }));
  }, [visibleReceipts]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Wordmark />
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </Button>
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

        {receipts.length === 0 ? (
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

            <div
              role="tablist"
              aria-label="Filter receipts"
              className="flex gap-2 mb-4"
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
            </div>

            {filter === "review" && visibleReceipts.length === 0 ? (
              <p
                className="text-[var(--ink-muted)] py-8 text-center"
                style={{ fontSize: "13px" }}
              >
                Nothing to review — every receipt has the fields it needs.
              </p>
            ) : null}

            {groupedReceipts.map(({ label, items }) => (
              <section key={label} className="mb-5">
                <h2
                  className="mb-2 text-[var(--ink-faint)]"
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
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

      <CaptureFab onClick={() => setCaptureOpen(true)} />

      <CaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
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
        Forward email receipts or text us a photo. We&apos;ll have them
        VAT-ready in minutes.
      </p>

      <div className="w-full max-w-[340px] space-y-3" style={{ marginBottom: "20px" }}>
        <IntakeRow
          callout="Forward email receipts to"
          value={forwardingEmail}
          mono
          copyLabel="Copy concierge email"
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

function IntakeRow({
  callout,
  value,
  mono,
  copyLabel,
}: {
  callout: string;
  value: string;
  mono: boolean;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* secure-context fallback: user can long-press to select */
    }
  }, [value]);

  return (
    <div className="text-left">
      <p
        className="font-accent italic text-[var(--ink-muted)]"
        style={{ fontSize: "12px", marginBottom: "6px" }}
      >
        {callout}
      </p>
      <div
        className="flex items-center gap-3 bg-card"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: "12px",
          padding: "12px 14px",
        }}
      >
        <span
          className={cn(
            "flex-1 min-w-0 text-[var(--ink)] truncate",
            mono ? "font-mono" : "",
          )}
          style={{ fontSize: "14px", fontWeight: 500 }}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 inline-flex items-center gap-1.5 text-white"
          style={{
            background: copied
              ? "var(--brand-deep, #1F9D63)"
              : "var(--primary)",
            padding: "6px 10px",
            borderRadius: "9px",
            fontSize: "13px",
            fontWeight: 600,
            transition: "background 160ms ease-out",
          }}
          aria-label={copyLabel}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy
            </>
          )}
        </button>
      </div>
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
      className="inline-flex items-center gap-1.5 transition-colors"
      style={{
        height: "32px",
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
