"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Receipt,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  LogOut,
  Plus,
  Utensils,
  Car,
  Hotel,
  Train,
  ShoppingBag,
  Monitor,
  Users,
  MapPin,
  Loader2,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";

// Transaction type
type Transaction = {
  id: string;
  merchant_name: string;
  merchant_address?: string;
  merchant_category: string;
  amount: number;
  currency: string;
  date: string;
  time: string;
  payment_method: string;
  status: string;
  auto?: boolean;
};

type CategoryKey = "meals" | "transport" | "accommodation" | "office_supplies" | "software" | "client_entertainment" | "travel" | "other";

const categoryIcons: Record<CategoryKey, typeof Utensils> = {
  meals: Utensils,
  transport: Car,
  accommodation: Hotel,
  office_supplies: ShoppingBag,
  software: Monitor,
  client_entertainment: Users,
  travel: Train,
  other: MapPin,
};

const categoryLabels: Record<CategoryKey, string> = {
  meals: "Meals & Dining",
  transport: "Transport",
  accommodation: "Accommodation",
  office_supplies: "Office Supplies",
  software: "Software & SaaS",
  client_entertainment: "Client Entertainment",
  travel: "Travel",
  other: "Other",
};

// Simulated OCR result for receipt data
function simulateOCR(transaction: Transaction) {
  // Generate realistic receipt line items based on category
  const itemSets: Record<string, Array<{ description: string; quantity: number; unit_price: number }>> = {
    meals: [
      { description: "Plat du jour - Poulet rôti", quantity: 1, unit_price: 16.50 },
      { description: "Salade César", quantity: 1, unit_price: 12.00 },
      { description: "Verre de vin rouge (Côtes du Rhône)", quantity: 2, unit_price: 5.50 },
      { description: "Café allongé", quantity: 2, unit_price: 2.90 },
      { description: "Dessert - Tarte tatin", quantity: 1, unit_price: 8.00 },
    ],
    travel: [
      { description: "Paris → Lyon | TGV 6231 | Voiture 12 Place 45", quantity: 1, unit_price: 78.00 },
      { description: "Lyon → Paris | TGV 6250 | Voiture 8 Place 22", quantity: 1, unit_price: 78.00 },
    ],
    transport: [
      { description: "UberX — Gare de Lyon → Bureau Opéra", quantity: 1, unit_price: 15.40 },
      { description: "Service fee", quantity: 1, unit_price: 1.55 },
      { description: "Booking fee", quantity: 1, unit_price: 1.55 },
    ],
    office_supplies: [
      { description: "Logitech MX Keys Mini Keyboard", quantity: 1, unit_price: 74.99 },
      { description: "USB-C Cable 2m (pack of 2)", quantity: 1, unit_price: 12.99 },
      { description: "Delivery fee", quantity: 1, unit_price: 2.01 },
    ],
    software: [
      { description: "Figma Professional — Monthly", quantity: 1, unit_price: 15.00 },
    ],
  };

  const items = itemSets[transaction.merchant_category] || itemSets.meals;
  const subtotal = items!.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxRate = transaction.merchant_category === "software" ? 20 : 10;
  const taxAmount = +(subtotal * taxRate / (100 + taxRate)).toFixed(2);

  return {
    merchant_name: transaction.merchant_name,
    merchant_address: transaction.merchant_address || "Paris, France",
    merchant_phone: "+33 1 42 36 87 12",
    merchant_vat_number: "FR 82 123 456 789",
    receipt_number: `REC-${Date.now().toString(36).toUpperCase()}`,
    receipt_date: transaction.date,
    receipt_time: transaction.time,
    items: items!.map((item, i) => ({
      ...item,
      total_price: +(item.quantity * item.unit_price).toFixed(2),
      sort_order: i,
    })),
    subtotal: +subtotal.toFixed(2),
    tax_rate: taxRate,
    tax_amount: taxAmount,
    tip_amount: transaction.merchant_category === "meals" ? 0 : 0,
    total: transaction.amount,
    payment_method: transaction.payment_method,
    card_last_four: transaction.payment_method?.split("•••• ")[1] || "0000",
    transaction_ref: `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    verification_code: `UR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    ocr_confidence: 96.5,
    captured_at: new Date().toISOString(),
  };
}

type DashboardProps = {
  userEmail: string;
};

export function Dashboard({ userEmail }: DashboardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<ReturnType<typeof simulateOCR> | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const handleCapture = (txn: Transaction) => {
    setSelectedTxn(txn);
    setReceiptData(null);
    setCapturedImage(null);
    setCaptureOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCapturedImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Simulate OCR processing
    setProcessing(true);
    setTimeout(() => {
      if (selectedTxn) {
        const data = simulateOCR(selectedTxn);
        setReceiptData(data);
        // Update transaction status
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === selectedTxn.id ? { ...t, status: "complete" } : t
          )
        );
      }
      setProcessing(false);
    }, 2500);
  };

  const handleLogout = async () => {
    await getSupabaseClient().auth.signOut();
    router.replace("/app/login");
  };

  const needsAction = transactions.filter((t) => t.status === "receipt_needed").length;
  const completed = transactions.filter((t) => t.status === "complete").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Receipt className="w-3.5 h-3.5 text-primary-foreground" />
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
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="font-semibold text-lg">Your Expenses</h1>
          <p className="text-sm text-muted-foreground">{userEmail}</p>
        </div>

        {/* Content */}
        {transactions.length === 0 ? (
          /* Empty state for new users */
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-semibold text-lg mb-2">No expenses yet</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
              Your expenses will appear here once your corporate card is connected. You&apos;ll be able to capture receipts and generate digital proofs of payment.
            </p>
            <div className="rounded-lg bg-muted/50 border border-border p-4 max-w-xs mx-auto text-left space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coming soon</p>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Camera className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Receipt Capture</p>
                  <p className="text-xs text-muted-foreground">Snap a photo, get a digital proof of payment</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Auto-matching</p>
                  <p className="text-xs text-muted-foreground">Receipts matched to card transactions automatically</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Card>
                <CardContent className="py-3 px-4 text-center">
                  <div className="text-2xl font-bold text-primary">{completed}</div>
                  <div className="text-xs text-muted-foreground">Captured</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 px-4 text-center">
                  <div className="text-2xl font-bold text-amber-600">{needsAction}</div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 px-4 text-center">
                  <div className="text-2xl font-bold">
                    {transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(0)}&euro;
                  </div>
                  <div className="text-xs text-muted-foreground">This month</div>
                </CardContent>
              </Card>
            </div>

            {/* Alert banner */}
            {needsAction > 0 && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    {needsAction} receipt{needsAction > 1 ? "s" : ""} needed
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Tap a transaction to capture the receipt
                  </p>
                </div>
              </div>
            )}

            {/* Transaction list */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Recent transactions
              </h2>
              {transactions.map((txn) => {
                const Icon = categoryIcons[txn.merchant_category as CategoryKey] || MapPin;
                const isActionable = txn.status === "receipt_needed";

                return (
                  <Card
                    key={txn.id}
                    className={`transition-all ${isActionable ? "cursor-pointer hover:border-primary/30" : ""}`}
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
                              {txn.merchant_name}
                            </p>
                            <p className="font-semibold text-sm tabular-nums shrink-0">
                              {txn.amount.toFixed(2)}&euro;
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {txn.date} &middot; {txn.time}
                            </span>
                            <Badge
                              variant="secondary"
                              className={`text-xs px-2 py-0.5 ${
                                txn.status === "complete"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {txn.status === "complete" ? (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Captured
                                </span>
                              ) : (
                                "Receipt Needed"
                              )}
                            </Badge>
                          </div>
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
          </>
        )}
      </div>

      {/* Capture dialog */}
      <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
        <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
          {selectedTxn && !receiptData && (
            <>
              <DialogHeader>
                <DialogTitle>Capture Receipt</DialogTitle>
              </DialogHeader>

              {/* Pre-filled info */}
              <div className="rounded-lg bg-muted/50 p-4 mb-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-sm">{selectedTxn.merchant_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {categoryLabels[selectedTxn.merchant_category as CategoryKey]}
                    </p>
                  </div>
                  <p className="font-semibold">{selectedTxn.amount.toFixed(2)}&euro;</p>
                </div>
                <Separator className="my-2" />
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Date: <span className="text-foreground">{selectedTxn.date}</span></div>
                  <div>Time: <span className="text-foreground">{selectedTxn.time}</span></div>
                </div>
                <p className="text-xs text-primary mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Auto-filled from bank transaction
                </p>
              </div>

              {!processing ? (
                <div>
                  {capturedImage ? (
                    <div className="rounded-lg overflow-hidden border mb-4">
                      <img src={capturedImage} alt="Receipt" className="w-full" />
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors mb-4"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium">Tap to take a photo</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Or choose from your gallery
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Button
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {capturedImage ? "Retake Photo" : "Capture Receipt"}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
                  <p className="text-sm font-medium">Processing receipt...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Extracting all details via OCR
                  </p>
                </div>
              )}
            </>
          )}

          {/* Digital Receipt View */}
          {receiptData && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold">Receipt Captured!</h3>
                <p className="text-xs text-muted-foreground">
                  Your digital proof of payment
                </p>
              </div>

              {/* The Digital Receipt */}
              <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-background overflow-hidden">
                {/* Receipt header */}
                <div className="bg-primary/10 px-5 py-4 text-center">
                  <p className="font-bold text-base">{receiptData.merchant_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {receiptData.merchant_address}
                  </p>
                  {receiptData.merchant_phone && (
                    <p className="text-xs text-muted-foreground">
                      {receiptData.merchant_phone}
                    </p>
                  )}
                </div>

                <div className="px-5 py-4 space-y-3">
                  {/* Date and receipt number */}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {receiptData.receipt_date} &middot; {receiptData.receipt_time}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {receiptData.receipt_number}
                    </span>
                  </div>

                  <Separator />

                  {/* Line items */}
                  <div className="space-y-2">
                    {receiptData.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{item.description}</p>
                          {item.quantity > 1 && (
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} x {item.unit_price.toFixed(2)}&euro;
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-medium tabular-nums shrink-0">
                          {item.total_price.toFixed(2)}&euro;
                        </p>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Totals */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">{receiptData.subtotal.toFixed(2)}&euro;</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        VAT ({receiptData.tax_rate}%)
                      </span>
                      <span className="tabular-nums">{receiptData.tax_amount.toFixed(2)}&euro;</span>
                    </div>
                    {receiptData.tip_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tip</span>
                        <span className="tabular-nums">{receiptData.tip_amount.toFixed(2)}&euro;</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between text-base font-bold pt-1">
                      <span>Total</span>
                      <span className="tabular-nums">{receiptData.total.toFixed(2)}&euro;</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Payment info */}
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment</span>
                      <span>{receiptData.payment_method}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transaction</span>
                      <span className="font-mono">{receiptData.transaction_ref}</span>
                    </div>
                    {receiptData.merchant_vat_number && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT No.</span>
                        <span className="font-mono">{receiptData.merchant_vat_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verification footer */}
                <div className="bg-primary/10 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-primary">
                        Verified by UnReceipt
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {receiptData.verification_code}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">
                      OCR {receiptData.ocr_confidence}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(receiptData.captured_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                This digital receipt is your proof of payment.
                <br />
                You can safely discard the paper receipt.
              </p>

              <Button
                className="w-full"
                onClick={() => {
                  setCaptureOpen(false);
                  setReceiptData(null);
                  setCapturedImage(null);
                }}
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden file input for camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
