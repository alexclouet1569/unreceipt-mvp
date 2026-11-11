// Initials and colour for a merchant's block: a copy of the website's
// src/lib/merchant-display.ts (a value import from the website isn't
// allowed in the app), so a merchant has the same colour on both. A test
// (src/lib/__tests__/merchant.test.ts) keeps the two in step.

// Every colour carries white initials at AA (DESIGN.md "Merchant logo").
export const MERCHANT_PALETTE = [
  "#1A7F52",
  "#303568",
  "#3B5B8C",
  "#6B4E8C",
  "#8C4A3B",
  "#2F6B7A",
  "#8C6320",
  "#A0405A",
  "#5A5F7A",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getMerchantInitials(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const words = trimmed
    .split(/\s+/)
    .filter((w) => /\w/.test(w))
    .slice(0, 2);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const w = words[0];
    return (w.length >= 2 ? w.slice(0, 2) : w).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getMerchantColor(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return MERCHANT_PALETTE[MERCHANT_PALETTE.length - 1];
  return MERCHANT_PALETTE[hash(trimmed.toLowerCase()) % MERCHANT_PALETTE.length];
}
