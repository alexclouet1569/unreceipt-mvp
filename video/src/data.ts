import type { RowData } from "./components/ReceiptRow";

// Sample receipts. ICA Maxi, SJ, Clas Ohlson and Uber are the shops the
// landing page already shows (src/app/_landing-copy.ts). VAT is worked out
// from the amounts: 342 × 12/112 = 36,64 · 489 × 6/106 = 27,68 · 1 450 × 25/125 = 290,00.
// Uber is in euros; its kronor amount is an ECB-style estimate (rate 11,20).
export const ICA: RowData = {
  merchant: "ICA Maxi",
  initials: "IM",
  color: "#1A7F52",
  amount: "342,00",
  suffix: "kr",
  meta: "Meals · now",
  state: "confirmed",
};

export const EMAIL_ROWS: RowData[] = [
  {
    merchant: "Uber",
    initials: "U",
    color: "#303568",
    amount: "23,40",
    suffix: "€",
    converted: "262,08",
    meta: "Transport",
    state: "to_confirm",
  },
  {
    merchant: "Clas Ohlson",
    initials: "CO",
    color: "#8C6320",
    amount: "1 450,00",
    suffix: "kr",
    meta: "Office",
    state: "to_confirm",
  },
  {
    merchant: "SJ",
    initials: "SJ",
    color: "#2C6E7A",
    amount: "489,00",
    suffix: "kr",
    meta: "Travel",
    state: "to_confirm",
  },
];

export const EMAIL_SUBJECTS = [
  { from: "Uber Receipts", subject: "Your Thursday trip with Uber" },
  { from: "Clas Ohlson", subject: "Order confirmation #48210" },
  { from: "SJ", subject: "Kvitto för din resa" },
];

export const VAT_ROWS = [
  { rate: "25 %", amount: "290,00" },
  { rate: "12 %", amount: "36,64" },
  { rate: "6 %", amount: "27,68" },
];
