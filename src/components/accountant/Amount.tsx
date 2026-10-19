import { splitFormattedAmount } from "@/lib/receipt-format";

type Props = {
  value: number;
  currency: string;
  /** "out" prefixes −, "in" prefixes +. Without it the amount is unsigned. */
  sign?: "out" | "in";
  /** Font size of the number in px; the currency suffix is set at 11px. */
  size?: number;
  /** Inline in a sentence: inherits size and colour, suffix not faded. */
  inline?: boolean;
};

/** A monetary amount: Geist Mono, tabular, currency suffix (DESIGN.md). */
export function Amount({ value, currency, sign, size = 14, inline }: Props) {
  const { value: number, suffix } = splitFormattedAmount(Math.abs(value), currency);
  const prefix = sign === "out" ? "−" : sign === "in" ? "+" : "";
  if (inline) {
    return (
      <span className="font-mono tabular-nums whitespace-nowrap">
        {prefix}
        {number}
        {suffix ? ` ${suffix}` : null}
      </span>
    );
  }
  return (
    <span className="font-mono tabular-nums whitespace-nowrap text-[var(--ink)]" style={{ fontSize: `${size}px`, fontWeight: 500 }}>
      {prefix}
      {number}
      {suffix ? (
        <span className="text-[var(--ink-faint)]" style={{ fontSize: "11px", marginLeft: "3px" }}>
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
