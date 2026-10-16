"use client";

import { useEffect, useRef, useState } from "react";
import { Dashboard } from "@/app/app/(authed)/dashboard";
import type { Receipt } from "@/lib/types";

// Sample data and browser-side stand-ins for the two routes the capture
// flow calls. See page.tsx: preview deployments only.

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
const sample = (over: Partial<Receipt>): Receipt => ({
  id: `demo-${++seq}`,
  transaction_id: null,
  user_id: "demo",
  source: "paper",
  merchant_name: "Shop",
  merchant_address: null,
  merchant_phone: null,
  merchant_vat_number: null,
  merchant_siret: null,
  category: "other",
  currency: "SEK",
  notes: null,
  receipt_number: null,
  receipt_date: daysAgo(0),
  receipt_time: null,
  purchased_at: null,
  subtotal: null,
  tax_amount: null,
  tax_rate: null,
  tip_amount: null,
  total: 100,
  payment_method: "Card",
  card_last_four: null,
  transaction_ref: null,
  image_url: null,
  image_captured_at: null,
  verification_code: null,
  capture_time_seconds: null,
  ocr_confidence: null,
  is_verified: false,
  edited_at: null,
  edited_fields: null,
  edit_history: null,
  status: "verified",
  original_source_url: null,
  original_source_kind: null,
  intake_ref: null,
  parse_confidence: null,
  items: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
});

const initialReceipts = (): Receipt[] => [
  sample({
    merchant_name: "ICA Maxi Stormarknad",
    category: "meals",
    total: 342,
    tax_amount: 36.64,
    tax_rate: 12,
    receipt_date: daysAgo(0),
    receipt_time: "12:14",
    card_last_four: "4421",
    items: [
      { label: "Lunch salads × 4", qty: 4, unit_amount: 69, total_amount: 276 },
      { label: "Sparkling water", qty: 6, unit_amount: 11, total_amount: 66 },
    ],
  }),
  sample({
    merchant_name: "SJ AB",
    category: "travel",
    total: 895,
    tax_amount: 50.66,
    tax_rate: 6,
    receipt_date: daysAgo(2),
    merchant_address: "Stockholm C → Göteborg C",
    is_verified: true,
    verification_code: "UR-4K2P-81ZD",
    receipt_number: "0139",
    source: "email",
  }),
  sample({
    merchant_name: "Espresso House",
    category: "meals",
    total: 68,
    tax_amount: 7.29,
    tax_rate: 12,
    receipt_date: daysAgo(2),
  }),
  sample({
    merchant_name: "Uber",
    category: "transport",
    currency: "EUR",
    total: 23.4,
    tax_amount: 2.13,
    tax_rate: 10,
    receipt_date: daysAgo(4),
    source: "email",
  }),
  sample({
    merchant_name: "Scandic Hotels",
    category: "accommodation",
    total: 1450,
    tax_amount: 155.36,
    tax_rate: 12,
    receipt_date: daysAgo(9),
    source: "email",
  }),
  sample({
    merchant_name: "Café de Flore",
    category: "client_entertainment",
    currency: "EUR",
    total: 64.5,
    tax_amount: 5.86,
    tax_rate: 10,
    receipt_date: daysAgo(11),
  }),
];

// What the photo "reads" as, whatever picture is chosen.
const DEMO_OCR = {
  merchant: "Clas Ohlson",
  amount: 245,
  currency: "SEK",
  receipt_date: daysAgo(0),
  category: "office_supplies",
  tax_amount: 49,
  tax_rate: 25,
  payment_method: "Card",
  items: [
    { label: "Extension cord 3 m", qty: 1, unit_amount: 149, total_amount: 149 },
    { label: "Cable ties, 100-pack", qty: 1, unit_amount: 49, total_amount: 49 },
    { label: "AA batteries", qty: 2, unit_amount: 23.5, total_amount: 47 },
  ],
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const num = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : null;

export function DemoClient() {
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts);
  const addReceipt = useRef((r: Receipt) => setReceipts((prev) => [r, ...prev]));

  useEffect(() => {
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.origin).pathname;
      if (path === "/api/ocr") {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        return json(DEMO_OCR);
      }
      if (path === "/api/capture") {
        const fd = init?.body instanceof FormData ? init.body : new FormData();
        const items = fd.get("items");
        const hasImage = fd.get("image") instanceof File;
        const receipt = sample({
          merchant_name: String(fd.get("merchant") ?? ""),
          total: num(fd.get("amount")),
          currency: String(fd.get("currency") ?? "SEK"),
          receipt_date: String(fd.get("receipt_date") ?? daysAgo(0)),
          category: String(fd.get("category") ?? "other") as Receipt["category"],
          tax_amount: num(fd.get("tax_amount")),
          tax_rate: num(fd.get("tax_rate")),
          payment_method: (fd.get("payment_method") as string | null) ?? null,
          notes: (fd.get("notes") as string | null) ?? null,
          items: typeof items === "string" ? JSON.parse(items) : null,
          source: hasImage ? "paper" : "manual",
          image_url: hasImage ? "demo/photo.jpg" : null,
        });
        addReceipt.current(receipt);
        return json({ ok: true, id: receipt.id, receipt });
      }
      // Nothing else reaches the real API from the demo; the receipt
      // viewer reads this as "no original".
      if (path.startsWith("/api/") && !path.startsWith("/api/merchant-logo/")) {
        return new Response(JSON.stringify({ error: "no_original" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(input, init);
    };
    return () => {
      window.fetch = realFetch;
    };
  }, []);

  return (
    <>
      <p
        role="note"
        className="bg-[var(--attention-tint)] px-4 py-2 text-center text-[13px] font-semibold text-[var(--attention-deep)]"
      >
        Preview demo · sample receipts · nothing is saved
      </p>
      <Dashboard
        userEmail="demo@unreceipt.com"
        receipts={receipts}
        forwardingEmail="receipts+demo@in.unreceipt.com"
        intakeSmsNumber={null}
      />
    </>
  );
}
