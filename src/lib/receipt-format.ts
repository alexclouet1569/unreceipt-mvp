/**
 * Shared receipt formatting helpers + constants.
 *
 * Both the customer dashboard surface and the admin concierge UI render
 * receipts; this module is the one place that knows how to format an
 * amount, render a category, and enumerate the currencies / categories
 * the paste form accepts. Keep in lockstep with the CHECK constraints
 * in supabase/schema.sql.
 */

import type { ReceiptCategory } from "./types";

export type CategoryKey = ReceiptCategory;

export type CategoryConfig = {
  label: string;
  // Lucide icon name — the consumer resolves it. Stored as a string so this
  // module stays renderer-agnostic and importable from server code.
  icon: CategoryIconName;
  /** Tailwind classes for the category badge background + text. */
  badgeClass: string;
};

export type CategoryIconName =
  | "Utensils"
  | "Car"
  | "Hotel"
  | "ShoppingBag"
  | "Monitor"
  | "Users"
  | "Train"
  | "MapPin";

export const CATEGORY_CONFIG: Record<CategoryKey, CategoryConfig> = {
  meals: {
    label: "Meals & dining",
    icon: "Utensils",
    badgeClass: "bg-amber-100 text-amber-800",
  },
  transport: {
    label: "Transport",
    icon: "Car",
    badgeClass: "bg-blue-100 text-blue-800",
  },
  accommodation: {
    label: "Accommodation",
    icon: "Hotel",
    badgeClass: "bg-violet-100 text-violet-800",
  },
  office_supplies: {
    label: "Office supplies",
    icon: "ShoppingBag",
    badgeClass: "bg-stone-100 text-stone-800",
  },
  software: {
    label: "Software & SaaS",
    icon: "Monitor",
    badgeClass: "bg-emerald-100 text-emerald-800",
  },
  client_entertainment: {
    label: "Client entertainment",
    icon: "Users",
    badgeClass: "bg-pink-100 text-pink-800",
  },
  travel: {
    label: "Travel",
    icon: "Train",
    badgeClass: "bg-sky-100 text-sky-800",
  },
  other: {
    label: "Other",
    icon: "MapPin",
    badgeClass: "bg-muted text-muted-foreground",
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG) as CategoryKey[];

export const CURRENCY_OPTIONS = ["EUR", "SEK", "USD", "GBP"] as const;
export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: "€",
  SEK: "kr",
  USD: "$",
  GBP: "£",
};

/**
 * Format a money amount with the currency symbol that the founder's
 * Swedish customers will recognise. Falls back to the ISO code if the
 * currency isn't one we've curated.
 */
export function formatAmount(
  amount: number | null | undefined,
  currency: string
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const symbol = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? currency;
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Plain-letter symbols (kr) read better as suffix; glyphs as prefix.
  if (symbol.length > 1) return `${formatted} ${symbol}`;
  return `${symbol}${formatted}`;
}

/**
 * Format an item quantity. Whole numbers render as integers ("2");
 * fractional quantities (weight-priced produce, half portions) render
 * with up to 3 decimals trimmed of trailing zeros ("0.5", "1.25").
 */
export function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(3).replace(/\.?0+$/, "");
}

/**
 * Format an ISO date string as `MMM D, YYYY`. Forwarded receipts only
 * carry a day-level granularity, so the time component is dropped.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function categoryLabel(key: string): string {
  return CATEGORY_CONFIG[key as CategoryKey]?.label ?? "Other";
}

/**
 * Bucket a receipt date into a relative-day group label for the inbox.
 * Returns "Today", "Yesterday", "This week", or "Earlier in {Month}".
 * Caller can override `now` for deterministic tests.
 */
export function relativeDayGroup(
  dateStr: string | null | undefined,
  now: Date = new Date()
): string {
  if (!dateStr) return "Earlier";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Earlier";

  const startOfDay = (dt: Date) => {
    const x = new Date(dt);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const today = startOfDay(now);
  const target = startOfDay(d);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today.getTime() - target.getTime()) / dayMs);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  const sameYear = target.getFullYear() === now.getFullYear();
  const monthLabel = target.toLocaleDateString("en-US", { month: "long" });
  return sameYear
    ? `Earlier in ${monthLabel}`
    : `Earlier in ${monthLabel} ${target.getFullYear()}`;
}

/**
 * Render the same amount the inbox card splits visually: a primary
 * numeric value and a smaller currency suffix. Used by ReceiptListItem.
 */
export function splitFormattedAmount(
  amount: number | null | undefined,
  currency: string
): { value: string; suffix: string } {
  const full = formatAmount(amount, currency);
  if (full === "—") return { value: full, suffix: "" };
  const symbol = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? currency;
  if (symbol.length > 1) {
    // suffix-style: "12.34 kr"
    return { value: full.slice(0, full.length - symbol.length - 1), suffix: symbol };
  }
  // prefix-style: "$12.34" — keep the glyph attached, no separate suffix
  return { value: full, suffix: "" };
}
