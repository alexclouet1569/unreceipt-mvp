import { formatPrice } from "@/lib/plans";

/** An EUR amount inline in text — Geist Mono, tabular (DESIGN.md). */
export function Money({ eur }: { eur: number }) {
  return <span className="font-mono tabular-nums">{formatPrice(eur)}</span>;
}
