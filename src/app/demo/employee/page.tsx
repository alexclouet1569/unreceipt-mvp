"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Receipt,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Upload,
  Utensils,
  Train,
  Hotel,
  Car,
  ShoppingBag,
  Monitor,
  Users,
  MapPin,
  LayoutDashboard,
} from "lucide-react";
import {
  transactions as allTransactions,
  employees,
  statusColors,
  statusLabels,
  categoryLabels,
  type Transaction,
  type ExpenseCategory,
} from "@/lib/mock-data";

const categoryIcons: Record<ExpenseCategory, typeof Utensils> = {
  meals: Utensils,
  transport: Car,
  accommodation: Hotel,
  office_supplies: ShoppingBag,
  software: Monitor,
  client_entertainment: Users,
  travel: Train,
  other: MapPin,
};

export default function EmployeeDemoPage() {
  // Default to Marie Dupont's view
  const employee = employees[0];
  const [txns, setTxns] = useState<Transaction[]>(
    allTransactions.filter((t) => t.employeeId === employee.id)
  );
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [justCaptured, setJustCaptured] = useState<string | null>(null);

  const handleCapture = (txn: Transaction) => {
    setSelectedTxn(txn);
    setCaptureDialogOpen(true);
  };

  const simulateCapture = () => {
    if (!selectedTxn) return;
    setCapturing(true);
    // Simulate OCR processing
    setTimeout(() => {
      setCapturing(false);
      setCaptureDialogOpen(false);
      setJustCaptured(selectedTxn.id);
      setTxns((prev) =>
        prev.map((t) =>
          t.id === selectedTxn.id
            ? { ...t, status: "complete" as const, captureTimeMinutes: 2 }
            : t
        )
      );
      // Clear the "just captured" animation after 3 seconds
      setTimeout(() => setJustCaptured(null), 3000);
    }, 2000);
  };

  const completedCount = txns.filter(
    (t) => t.status === "complete" || t.status === "approved"
  ).length;
  const needsActionCount = txns.filter(
    (t) => t.status === "receipt_needed" || t.status === "flagged"
  ).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Receipt className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">UnReceipt</span>
          </div>
          <Link href="/demo/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <LayoutDashboard className="w-3.5 h-3.5" />
              Finance
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Employee info */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {employee.avatarInitials}
            </div>
            <div>
              <h1 className="font-semibold text-lg">{employee.name}</h1>
              <p className="text-sm text-muted-foreground">
                {employee.role} &middot; {employee.department}
              </p>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {completedCount}
              </div>
              <div className="text-xs text-muted-foreground">Captured</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <div className="text-2xl font-bold text-amber-600">
                {needsActionCount}
              </div>
              <div className="text-xs text-muted-foreground">Needs action</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <div className="text-2xl font-bold">
                {txns
                  .reduce((sum, t) => sum + t.amount, 0)
                  .toFixed(0)}
                &euro;
              </div>
              <div className="text-xs text-muted-foreground">This month</div>
            </CardContent>
          </Card>
        </div>

        {/* Notification banner for receipt_needed */}
        {needsActionCount > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                {needsActionCount} receipt{needsActionCount > 1 ? "s" : ""}{" "}
                needed
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Snap a photo now while they&apos;re still in your pocket
              </p>
            </div>
          </div>
        )}

        {/* Transaction feed */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Recent transactions
          </h2>
          {txns.map((txn) => {
            const Icon = categoryIcons[txn.merchantCategory];
            const isActionable =
              txn.status === "receipt_needed" || txn.status === "flagged";

            return (
              <Card
                key={txn.id}
                className={`transition-all duration-500 ${
                  justCaptured === txn.id
                    ? "ring-2 ring-primary bg-primary/5"
                    : ""
                } ${isActionable ? "cursor-pointer hover:border-primary/30" : ""}`}
                onClick={() => isActionable && handleCapture(txn)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">
                          {txn.merchantName}
                        </p>
                        <p className="font-semibold text-sm tabular-nums shrink-0">
                          {txn.amount.toFixed(2)}&euro;
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {txn.date} &middot; {txn.time}
                          </span>
                          {txn.captureTimeMinutes !== undefined &&
                            txn.captureTimeMinutes > 0 && (
                              <span className="text-xs text-primary flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {txn.captureTimeMinutes}min
                              </span>
                            )}
                          {txn.captureTimeMinutes === 0 && (
                            <span className="text-xs text-primary flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Auto
                            </span>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className={`text-xs px-2 py-0.5 ${statusColors[txn.status]}`}
                        >
                          {statusLabels[txn.status]}
                        </Badge>
                      </div>
                      {txn.policyViolation && (
                        <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {txn.policyViolation}
                        </p>
                      )}
                      {txn.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {txn.notes}
                        </p>
                      )}
                      {justCaptured === txn.id && (
                        <p className="text-xs text-primary mt-1.5 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Receipt captured — expense submitted!
                        </p>
                      )}
                    </div>
                    {isActionable && (
                      <div className="shrink-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Camera className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Demo note */}
        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            This is a prototype with mock data.{" "}
            <Link href="/#waitlist" className="text-primary hover:underline">
              Join the waitlist
            </Link>{" "}
            for the real thing.
          </p>
        </div>
      </div>

      {/* Receipt capture dialog */}
      <Dialog open={captureDialogOpen} onOpenChange={setCaptureDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Capture Receipt</DialogTitle>
          </DialogHeader>
          {selectedTxn && (
            <div>
              {/* Pre-filled transaction info */}
              <div className="rounded-lg bg-muted/50 p-4 mb-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-sm">
                      {selectedTxn.merchantName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {categoryLabels[selectedTxn.merchantCategory]}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {selectedTxn.amount.toFixed(2)}&euro;
                  </p>
                </div>
                <Separator className="my-2" />
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    Date: <span className="text-foreground">{selectedTxn.date}</span>
                  </div>
                  <div>
                    Time: <span className="text-foreground">{selectedTxn.time}</span>
                  </div>
                </div>
                <p className="text-xs text-primary mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Auto-filled from bank transaction
                </p>
              </div>

              {/* Upload area */}
              {!capturing ? (
                <div>
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors mb-4"
                    onClick={simulateCapture}
                  >
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">
                      Tap to take a photo of your receipt
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Or drag and drop an image
                    </p>
                  </div>
                  <Input
                    placeholder="Add a note (optional)"
                    className="mb-4"
                  />
                  <Button className="w-full" onClick={simulateCapture}>
                    <Camera className="w-4 h-4 mr-2" />
                    Capture Receipt
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 animate-pulse">
                    <Receipt className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Processing receipt...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Extracting merchant, amount, and VAT via OCR
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
