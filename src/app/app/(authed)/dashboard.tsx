"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, LogOut, Plus, Receipt as ReceiptIcon } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import { formatAmount } from "@/lib/receipt-format";
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
      .filter((r) => (r.receipt_date ?? "") >= monthIso)
      .reduce((sum, r) => sum + (r.total ?? 0), 0);
    const verified = receipts.filter((r) => r.is_verified).length;
    const pending = receipts.length - verified;

    return { baseCurrency, monthTotal, verified, pending };
  }, [receipts]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <ReceiptIcon className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">UnReceipt</span>
          </div>
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

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-semibold text-lg">Your receipts</h1>
            <p className="text-sm text-muted-foreground">{userEmail}</p>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCaptureOpen(true)}
          >
            <Plus className="w-4 h-4" />
            Capture
          </Button>
        </div>

        {receipts.length === 0 ? (
          <EmptyState onCapture={() => setCaptureOpen(true)} />
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

            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Recent
            </h2>
            <div className="space-y-2">
              {receipts.map((r) => (
                <ReceiptListItem
                  key={r.id}
                  receipt={r}
                  onClick={() => setOpenReceipt(r)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <CaptureDialog
        userId={userId}
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

function EmptyState({ onCapture }: { onCapture: () => void }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Camera className="w-6 h-6 text-primary" />
        </div>
        <h2 className="font-semibold text-base mb-1">No receipts yet</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
          Forward a receipt to your concierge inbox, or capture one
          here. We&apos;ll have a VAT-ready record in your dashboard
          within 24 hours.
        </p>
        <Button onClick={onCapture} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Capture your first
        </Button>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4 text-center">
        <div className="text-base font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
