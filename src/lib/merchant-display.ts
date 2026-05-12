/**
 * Deterministic visual treatment for a merchant on inbox cards: 1–2 char
 * initials and a calm background color hashed from the merchant name.
 * Same merchant → same color every render.
 */

const PALETTE = [
  "#27BE7B", // brand green
  "#1F9D63", // brand deep
  "#303568", // deep space
  "#5b8def",
  "#c08be0",
  "#e08b8b",
  "#e0b48b",
  "#8bbfa7",
  "#a1a6c8",
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
