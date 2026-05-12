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
import { getConciergeEmail } from "@/lib/concierge-email";
import { formatAmount, relativeDayGroup } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";
import { CaptureDialog } from "./CaptureDialog";
import { ReceiptDetailDialog } from "./ReceiptDetailDialog";

type DashboardProps = {
  userId: string;
  userEmail: string;
  receipts: Receipt[];
};

export function Dashboard({ userId, userEmail, receipts }: DashboardProps) {
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);

  const handleLogout = async () => {
    await getSupabaseClient().auth.signOut();
    router.replace("/app/login");
  };

  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthIso = monthStart.toISOString().slice(0, 10);

    const baseCurrency = receipts[0]?.currency ?? "EUR";
    const monthTotal = receipts
      .filter((r) => (r.purchased_at ?? r.receipt_date ?? "") >= monthIso)
      .reduce((sum, r) => sum + (r.total ?? 0), 0);
    const verified = receipts.filter((r) => r.is_verified).length;
    const pending = receipts.length - verified;

    return { baseCurrency, monthTotal, verified, pending };
  }, [receipts]);

  const groupedReceipts = useMemo(() => {
    const order = ["Today", "Yesterday", "This week"];
    const groups = new Map<string, typeof receipts>();
    for (const r of receipts) {
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
  }, [receipts]);

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
          <EmptyState userId={userId} onCapture={() => setCaptureOpen(true)} />
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

            {stats.pending > 0 ? (
              <p className="text-xs text-muted-foreground mb-3">
                {stats.pending} receipt{stats.pending === 1 ? "" : "s"} awaiting
                verification by your concierge.
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
  userId,
  onCapture,
}: {
  userId: string;
  onCapture: () => void;
}) {
  const conciergeEmail = getConciergeEmail(userId);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(conciergeEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Some browsers block clipboard without a secure context — fall back
      // to text selection on the address so the user can long-press copy.
    }
  }, [conciergeEmail]);

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
        Forward your email receipts to your private inbox address. We&apos;ll
        have them VAT-ready in minutes.
      </p>

      <div
        className="w-full max-w-[340px] flex items-center gap-3 bg-card"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: "12px",
          padding: "14px 16px",
          marginBottom: "20px",
        }}
      >
        <span
          className="font-mono flex-1 min-w-0 text-[var(--ink)] truncate"
          style={{ fontSize: "14px", fontWeight: 500 }}
        >
          {conciergeEmail}
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
          aria-label="Copy concierge email"
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

      <button
        type="button"
        onClick={onCapture}
        className="inline-flex items-center gap-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        style={{ fontSize: "13px", fontWeight: 500 }}
      >
        <Plus className="w-4 h-4" />
        Or capture a paper receipt
      </button>
    </div>
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
