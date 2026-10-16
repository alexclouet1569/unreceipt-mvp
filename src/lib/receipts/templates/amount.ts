// Shared money and HTML helpers for the email templates.

// An amount as receipts write it: "189", "189,00", "1 234,50" (space, no-
// break or thin space as thousands separator), "1.234,56", "1,234.56".
// Thousands groups must be exactly 3 digits, so "Total 2 items" can't
// glue on the next number.
export const AMOUNT_PATTERN = String.raw`\d{1,3}(?:[   .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[   ]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const last = Math.max(lastComma, lastDot);
  let normalised = s;
  if (last !== -1) {
    const decimals = s.length - last - 1;
    // The last separator is the decimal point only when 1–2 digits follow
    // it; otherwise every separator groups thousands ("1.234" = 1234).
    normalised =
      decimals >= 1 && decimals <= 2
        ? s.slice(0, last).replace(/[.,]/g, "") + "." + s.slice(last + 1)
        : s.replace(/[.,]/g, "");
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

export function currencyFromSymbol(sym: string): string | undefined {
  const s = sym.toLowerCase();
  if (s === "$") return "USD";
  if (s === "€") return "EUR";
  if (s === "kr" || s === "sek") return "SEK";
  if (/^[a-z]{3}$/.test(s)) return s.toUpperCase();
  return undefined;
}

// `<[^<>]*>` rather than `<[^>]+>`: the latter backtracks quadratically on
// HTML with many unclosed "<" (a 300 KB body took 21 s).
export function stripHtml(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^<>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Name <user@example.com>" or "user@example.com" → "example.com".
export function senderDomain(from: string): string | null {
  const m = from.toLowerCase().match(/@([a-z0-9.-]{1,253})>?\s*$/);
  return m ? m[1] : null;
}

export function isFromDomain(from: string, domains: readonly string[]): boolean {
  const domain = senderDomain(from);
  return domain != null && domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}
