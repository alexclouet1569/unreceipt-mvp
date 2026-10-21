"use client";

import { useI18n } from "@/lib/i18n/client";
import { formatAmount } from "@/lib/receipt-format";

/** An EUR amount inline in text — Geist Mono, tabular (DESIGN.md), in the product language. */
export function Money({ eur }: { eur: number }) {
  const { locale } = useI18n();
  return <span className="font-mono tabular-nums">{formatAmount(eur, "EUR", locale)}</span>;
}
