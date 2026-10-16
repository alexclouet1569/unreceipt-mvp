// Shared money, date and HTML helpers for the email templates.

import { CURRENCY_OPTIONS } from "@/lib/receipt-format";

// An amount as receipts write it: "189", "189,00", "1 234,50" (space, no-
// break or thin space as thousands separator, never a line break),
// "1.234,56", "1,234.56". Thousands groups must be exactly 3 digits, and
// the amount must not run on into more digits ("Total 189" then "200 kr"
// on the next line was read as 189200) or be a percentage ("12,5 %").
export const AMOUNT_PATTERN =
  String.raw`(?:\d{1,3}(?:[   .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![.,]?\d)(?![ \t ]*%)`;

// What may stand next to the amount: an ISO code, $, € or kr.
export const CURRENCY_TOKEN = String.raw`[A-Z]{3}|\$|€|kr`;

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

// `sym` as written in the email. Codes must be upper case and one we
// support ("49.00 Date paid" used to yield "DAT"). "kr" is also Norwegian
// and Danish ("moms" is Danish too), so it means SEK only with a signal
// that is Swedish alone, and never next to a Danish or Norwegian one.
const SWEDISH_ONLY = /\bSEK\b|\bkronor\b|varav moms|inkl\.? moms|momsreg|\b\d{6}-\d{4}\b/i;
const DANISH_OR_NORWEGIAN = /\b(?:heraf|DKK|NOK|mva|kroner)\b/i;

export function currencyFromSymbol(sym: string, context: string): string | undefined {
  if (sym === "$") return "USD";
  if (sym === "€") return "EUR";
  if (sym === "SEK") return "SEK";
  if (sym.toLowerCase() === "kr") {
    return SWEDISH_ONLY.test(context) && !DANISH_OR_NORWEGIAN.test(context) ? "SEK" : undefined;
  }
  return (CURRENCY_OPTIONS as readonly string[]).includes(sym) ? sym : undefined;
}

// The currency written before the amount, or else the one after it.
export function currencyAround(before: string | undefined, after: string | undefined, context: string) {
  return currencyFromSymbol(before ?? "", context) ?? currencyFromSymbol(after ?? "", context);
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  thinsp: " ",
  ensp: " ",
  emsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  euro: "€",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// Text with one line per block, so a label and its amount stay together
// and numbers on different lines never merge. `<[^<>]*>` rather than
// `<[^>]+>`: the latter backtracks quadratically on many unclosed "<"
// (a 300 KB body took 21 s).
// Input is capped first: the lazy <style>/<script> strippers are still
// quadratic on hostile HTML, and no receipt needs more than this.
export const MAX_BODY_CHARS = 200_000;

export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .slice(0, MAX_BODY_CHARS)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>|<\/(?:p|div|tr|li|h[1-6]|table)>/gi, "\n")
      .replace(/<[^<>]*>/g, " ")
  )
    .replace(/[ \t     ]+/g, (ws) => (/[  ]/.test(ws) ? " " : " "))
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
const MONTH = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const DMY_RE = new RegExp(String.raw`\b(\d{1,2})\s+${MONTH}\s+(\d{4})\b`, "gi");
const MDY_RE = new RegExp(String.raw`\b${MONTH}\s+(\d{1,2}),?\s+(\d{4})\b`, "gi");

function isoDate(day: string, month: string, year: string): string | null {
  const mm = MONTHS[month.toLowerCase().slice(0, 3)];
  const d = Number(day);
  const y = Number(year);
  if (!mm || d < 1) return null;
  // Rejects "October 45" and "31 February".
  const daysInMonth = new Date(Date.UTC(y, Number(mm), 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return `${year}-${mm}-${String(d).padStart(2, "0")}`;
}

// The first valid date in the text, in either "14 Oct 2026" or
// "Oct 14, 2026" form; a line starting "Date paid"/"Paid" wins over the
// rest ("Next billing date", "Due date" never count as the label).
export function findDate(text: string): string | null {
  const labelled = text.match(/^[ \t]*(?:date paid|paid on|paid)\b[ \t:]*([^\n]{0,40})/im);
  for (const source of labelled ? [labelled[1], text] : [text]) {
    const found: { index: number; iso: string }[] = [];
    for (const m of source.matchAll(DMY_RE)) {
      const iso = isoDate(m[1], m[2], m[3]);
      if (iso) found.push({ index: m.index ?? 0, iso });
    }
    for (const m of source.matchAll(MDY_RE)) {
      const iso = isoDate(m[2], m[1], m[3]);
      if (iso) found.push({ index: m.index ?? 0, iso });
    }
    if (found.length > 0) return found.sort((a, b) => a.index - b.index)[0].iso;
  }
  return null;
}

// Refund and credit emails share the receipt layout but aren't expenses.
// The subject counts anywhere; the body only where a line starts with the
// word, so a receipt's "refund policy" footer doesn't. `u` flag: without
// it "å" isn't a letter and "Återbetalning" was missed.
const REFUND_WORD = String.raw`(?:refund(?:ed)?|återbetal\p{L}*|rembours\p{L}*|credit note|kreditnota)(?![\p{L}\d])`;
const REFUND_IN_SUBJECT = new RegExp(String.raw`(?<![\p{L}\d])${REFUND_WORD}`, "iu");
const REFUND_LINE = new RegExp(String.raw`^[ \t]*${REFUND_WORD}`, "imu");

export function looksLikeRefund(subject: string, text: string): boolean {
  return REFUND_IN_SUBJECT.test(subject) || REFUND_LINE.test(text.slice(0, 5000));
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
