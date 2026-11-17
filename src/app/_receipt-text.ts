import type { Locale } from "@/lib/locale";

/**
 * What the landing page's printed receipt says, per page language
 * (`_receipt-backdrop.tsx` draws it). Kept out of the client component so a
 * page sends only its own language to the browser: the server page picks
 * `landingReceipt(locale)` and passes it down.
 */

export type ReceiptRow =
  | { kind: "item"; label: string; amount: number; sum?: boolean }
  | { kind: "text"; label: string; value: string }
  | { kind: "total"; label: string; amount: number }
  | { kind: "rule" }
  | { kind: "head" }
  | { kind: "foot" };

export type Line = { label: string; amount: number };

/** What the receipt says, per page language. */
export type ReceiptText = {
  /** Shown after the running subtotal on the print head. */
  currency: string;
  place: string;
  ticket: string;
  thanks: string;
  /** Eight purchases, two per gap between sections. */
  items: [Line, Line, Line, Line, Line, Line, Line, Line];
  total: string;
  vat: Line;
  lost: string;
  chasing: string;
  stress: string;
  stamp: string;
};

// Swedish shops in kronor; the English page shows the same receipt.
const SWEDISH_ITEMS: ReceiptText["items"] = [
  { label: "ICA Maxi", amount: 342 },
  { label: "SJ Stockholm–Göteborg", amount: 895 },
  { label: "Spotify Business", amount: 129 },
  { label: "Scandic Hotel", amount: 1250 },
  { label: "Uber", amount: 189 },
  { label: "Apoteket", amount: 212 },
  { label: "Coop Konferens", amount: 890 },
  { label: "Pressbyrån", amount: 68 },
];

const TEXT: Record<Locale, ReceiptText> = {
  en: {
    currency: "kr",
    place: "unreceipt.com · Stockholm",
    ticket: "Kvitto #0042 · 14.10.2026 09:41",
    thanks: "Tack! Paper is past.",
    items: SWEDISH_ITEMS,
    total: "Summa",
    vat: { label: "Varav moms", amount: 795 },
    lost: "Lost receipts",
    chasing: "Hours chasing",
    stress: "Total stress",
    stamp: "✓ VAT-ready",
  },
  sv: {
    currency: "kr",
    place: "unreceipt.com · Stockholm",
    ticket: "Kvitto #0042 · 14.10.2026 09:41",
    thanks: "Tack! Paper is past.",
    items: SWEDISH_ITEMS,
    total: "Summa",
    vat: { label: "Varav moms", amount: 795 },
    lost: "Borttappade kvitton",
    chasing: "Timmar på kvittojakt",
    stress: "Stress totalt",
    stamp: "✓ Momsen klar",
  },
  fr: {
    currency: "€",
    place: "unreceipt.com · Paris",
    ticket: "Ticket n° 0042 · 14/10/2026 09:41",
    thanks: "Merci\u00a0! Le papier, c’est du passé.",
    items: [
      { label: "Paul", amount: 18.5 },
      { label: "SNCF Paris–Lyon", amount: 64 },
      { label: "Spotify", amount: 11.99 },
      { label: "Ibis Paris", amount: 89 },
      { label: "Uber", amount: 23.4 },
      { label: "Pharmacie", amount: 8.9 },
      { label: "Carrefour", amount: 42 },
      { label: "Relay", amount: 4.5 },
    ],
    total: "Total TTC",
    vat: { label: "Dont TVA", amount: 23.62 },
    lost: "Tickets perdus",
    chasing: "Heures de relance",
    stress: "Stress total",
    stamp: "✓ TVA relevée",
  },
};

function receiptFor(locale: Locale) {
  const t = TEXT[locale];
  const item = (i: number) => ({ kind: "item" as const, ...t.items[i] });
  const total = Math.round(t.items.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  return {
    top: [{ kind: "head" }, { kind: "rule" }],
    features: [item(0), item(1)],
    how: [item(2), item(3)],
    difference: [item(4), item(5)],
    pricing: [item(6), item(7), { kind: "rule" }],
    about: [
      { kind: "total", label: t.total, amount: total },
      { kind: "item", label: t.vat.label, amount: t.vat.amount, sum: false },
      { kind: "rule" },
    ],
    badges: [
      { kind: "text", label: t.lost, value: "0" },
      { kind: "text", label: t.chasing, value: "0,00" },
    ],
    end: [{ kind: "rule" }, { kind: "text", label: t.stress, value: "0,00" }, { kind: "foot" }],
  } satisfies Record<string, ReceiptRow[]>;
}

export type LandingReceipt = {
  text: ReceiptText;
  /** Receipt lines keyed by where they sit on the page. */
  rows: ReturnType<typeof receiptFor>;
};

/** One language's receipt, for the landing page of that language. */
export function landingReceipt(locale: Locale): LandingReceipt {
  return { text: TEXT[locale], rows: receiptFor(locale) };
}
