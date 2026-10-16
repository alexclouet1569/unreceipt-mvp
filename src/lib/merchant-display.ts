/**
 * Deterministic visual treatment for a merchant on inbox cards: 1–2 char
 * initials and a calm background color hashed from the merchant name.
 * Same merchant → same color every render.
 */

// Every colour carries white initials at AA (4.5:1 or better); see
// DESIGN.md "Merchant logo".
const PALETTE = [
  "#1A7F52", // brand action green, 5.0:1
  "#303568", // deep space, 11.5:1
  "#3B5B8C", // slate blue, 6.9:1
  "#6B4E8C", // plum, 6.8:1
  "#8C4A3B", // clay, 6.7:1
  "#2F6B7A", // teal, 6.0:1
  "#8C6320", // honey deep, 5.4:1
  "#A0405A", // berry, 6.2:1
  "#5A5F7A", // ink muted, 6.3:1
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
  if (!trimmed) return PALETTE[PALETTE.length - 1];
  return PALETTE[hash(trimmed.toLowerCase()) % PALETTE.length];
}
