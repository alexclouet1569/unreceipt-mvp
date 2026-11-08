// Reads a bank statement exported as CSV from the bank's internet bank
// (Swedish and French banks: Swedbank, SEB, Nordea, Handelsbanken,
// Länsförsäkringar, Danske Bank, Crédit Agricole, BNP, Qonto …) into
// dated, signed amounts. Pure: no I/O.
//
// Banks don't share a format, so nothing is hard-coded per bank. We find
// the header row by its column names (Swedish, English, French), guess the
// delimiter, and read Swedish/French numbers ("-1 234,50") as well as
// English ones ("-1,234.50"). Money out is negative. Files with a separate
// debit and credit column are folded into one signed amount.
//
// Column names were collected from the banks' public help pages and sample
// exports, not tested against every bank's current file: an unrecognised
// file gets a clear error naming the columns we look for and the ones we
// found, never a guess.

export type ParsedBankRow = {
  /** YYYY-MM-DD: the purchase day when the file has one, else the booking day. */
  bookedOn: string;
  /** Signed, two decimals. Negative = money out. */
  amount: number;
  /** ISO 4217 when the file says, else null (the caller uses the company's currency). */
  currency: string | null;
  description: string;
};

export type ParseStatementResult =
  | { ok: true; rows: ParsedBankRow[]; skipped: number }
  | { ok: false; error: string };

export const MAX_STATEMENT_ROWS = 5000;
export const MAX_DESCRIPTION_LENGTH = 300;
export const MAX_AMOUNT = 1e11;

// Normalised header names (lowercase, no accents, no "(SEK)"), by priority.
// The purchase day comes before the booking day: a card payment is booked
// a day or three after the receipt is dated.
const DATE_HEADERS = [
  "transaktionsdag",
  "transaktionsdatum",
  "kopdatum",
  "transaction date",
  "date operation",
  "date de l'operation",
  "datum",
  "date",
  "bokforingsdag",
  "bokforingsdatum",
  "bokford",
  "bokfort",
  "booking date",
  "booked",
  "date comptable",
  "date de comptabilisation",
  "valutadag",
  "value date",
  "date de valeur",
  "date valeur",
];

const AMOUNT_HEADERS = ["belopp", "amount", "montant", "summa", "transaktionsbelopp"];

const DEBIT_HEADERS = ["debet", "debit", "uttag", "withdrawal", "withdrawals", "money out", "ut"];
const CREDIT_HEADERS = ["kredit", "credit", "insattning", "deposit", "deposits", "money in", "in"];

const DESCRIPTION_HEADERS = [
  "text",
  "beskrivning",
  "rubrik",
  "transaktionstext",
  "transaktion",
  "specifikation",
  "mottagare",
  "description",
  "details",
  "narrative",
  "payee",
  "libelle",
  "libelle operation",
  "libelle de l'operation",
  "meddelande",
  "referens",
  "reference",
  "message",
];

const CURRENCY_HEADERS = ["valuta", "currency", "devise"];

const CURRENCY_WORDS: Record<string, string> = {
  sek: "SEK",
  kr: "SEK",
  kronor: "SEK",
  eur: "EUR",
  euro: "EUR",
  euros: "EUR",
  nok: "NOK",
  dkk: "DKK",
  usd: "USD",
  gbp: "GBP",
};

const DELIMITERS = [";", "\t", ","] as const;
const HEADER_SEARCH_ROWS = 25;

/** Lowercase, accents removed, "(SEK)" and a trailing currency code dropped. */
export function normalizeHeader(cell: string): { name: string; currency: string | null } {
  let s = cell
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .trim();
  let currency: string | null = null;
  const paren = /\(\s*(?:en\s+|i\s+)?([a-z]+)\s*\)/.exec(s);
  if (paren) currency = CURRENCY_WORDS[paren[1]] ?? null;
  s = s.replace(/\(.*?\)/g, " ").trim();
  const trailing = /\s(?:en\s+|i\s+)?([a-z]+)$/.exec(s);
  if (trailing && CURRENCY_WORDS[trailing[1]]) {
    currency = currency ?? CURRENCY_WORDS[trailing[1]];
    s = s.slice(0, trailing.index);
  }
  return { name: s.replace(/[_\s]+/g, " ").replace(/:$/, "").trim(), currency };
}

/** RFC 4180-style split: quotes, doubled quotes, delimiters and newlines inside quotes. */
export function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * "-1 234,50", "1.234,50", "1,234.50", "−45,00", "45,00-", "(45.00)",
 * "-45,00 kr" → number. Null when it isn't a number.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (s === "") return null;
  let negative = false;
  s = s.replace(/[−‒–—]/g, "-");
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\s*(kr|sek|eur|€|\$|£|nok|dkk|usd|gbp)\.?\s*$/i, "").replace(/^(kr|sek|eur|€|\$|£)\s*/i, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // Thousands separators that are spaces of any kind, or apostrophes.
  s = s.replace(/[\s   ']/g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Both: the later one is the decimal separator.
    normalized =
      lastComma > lastDot
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "1,234,567" or "1,234" (three digits after a lone comma) are
    // thousands; Swedish and French files always write two decimals.
    normalized = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3}){2,}$/.test(s) ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  const n = Number(normalized);
  // NUMERIC(14,2) holds under 10^12; nothing on a company statement is
  // near that, so a bigger number is a misread column, not an amount.
  if (!Number.isFinite(n) || n >= MAX_AMOUNT) return null;
  const rounded = Math.round(n * 100) / 100;
  return negative ? -rounded : rounded;
}

function validDay(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * "2026-11-03", "2026/11/03", "20261103", "03/11/2026", "03.11.2026",
 * "03-11-2026", "03/11/26" (day first, as in Europe), with an optional
 * time after it → "2026-11-03".
 */
export function parseDay(raw: string): string | null {
  const s = raw.trim().split(/[ T]/)[0];
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDay(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

type Columns = {
  date: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  descriptions: number[];
  currency: number | null;
  headerCurrency: string | null;
};

function findColumns(header: string[]): Columns | null {
  const names = header.map(normalizeHeader);
  const indexOf = (candidates: string[]) => {
    for (const c of candidates) {
      const i = names.findIndex((n) => n.name === c);
      if (i >= 0) return i;
    }
    return -1;
  };
  const date = indexOf(DATE_HEADERS);
  if (date < 0) return null;
  const amount = indexOf(AMOUNT_HEADERS);
  const debit = indexOf(DEBIT_HEADERS);
  const credit = indexOf(CREDIT_HEADERS);
  if (amount < 0 && (debit < 0 || credit < 0)) return null;
  const descriptions: number[] = [];
  for (const c of DESCRIPTION_HEADERS) {
    const i = names.findIndex((n) => n.name === c);
    if (i >= 0 && !descriptions.includes(i)) descriptions.push(i);
    if (descriptions.length === 2) break;
  }
  const currency = indexOf(CURRENCY_HEADERS);
  const amountCol = amount >= 0 ? amount : debit;
  return {
    date,
    amount: amount >= 0 ? amount : null,
    debit: amount >= 0 ? null : debit,
    credit: amount >= 0 ? null : credit,
    descriptions,
    currency: currency >= 0 ? currency : null,
    headerCurrency: names[amountCol]?.currency ?? null,
  };
}

function cleanText(s: string): string {
  // Control characters out, whitespace folded, a leading formula sign kept
  // as text (the description ends up in CSV exports and emails).
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH);
}

const EXPECTED =
  "We look for a date column (Datum, Transaktionsdag, Bokföringsdag, Date) and an amount column (Belopp, Amount, Montant, or Debet and Kredit).";

export function parseBankStatement(input: string): ParseStatementResult {
  const text = input.replace(/^﻿/, "");
  if (text.trim() === "") return { ok: false, error: "The file is empty." };

  for (const delimiter of DELIMITERS) {
    const rows = splitCsv(text, delimiter);
    const headerAt = rows
      .slice(0, HEADER_SEARCH_ROWS)
      .findIndex((r) => r.length >= 2 && findColumns(r) !== null);
    if (headerAt < 0) continue;
    const cols = findColumns(rows[headerAt])!;

    const out: ParsedBankRow[] = [];
    let skipped = 0;
    for (const r of rows.slice(headerAt + 1)) {
      if (r.every((c) => c.trim() === "")) continue;
      const bookedOn = parseDay(r[cols.date] ?? "");
      let amount: number | null;
      if (cols.amount !== null) {
        amount = parseAmount(r[cols.amount] ?? "");
      } else {
        const debit = parseAmount(r[cols.debit!] ?? "");
        const credit = parseAmount(r[cols.credit!] ?? "");
        amount =
          debit === null && credit === null
            ? null
            : Math.round(((credit === null ? 0 : Math.abs(credit)) - (debit === null ? 0 : Math.abs(debit))) * 100) / 100;
      }
      if (!bookedOn || amount === null) {
        skipped++;
        continue;
      }
      const rawCurrency = cols.currency !== null ? (r[cols.currency] ?? "").trim().toUpperCase() : "";
      const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : cols.headerCurrency;
      const parts = cols.descriptions
        .map((i) => cleanText(r[i] ?? ""))
        .filter((p, i, all) => p !== "" && all.indexOf(p) === i);
      out.push({ bookedOn, amount, currency, description: cleanText(parts.join(" · ")) });
      if (out.length > MAX_STATEMENT_ROWS) {
        return {
          ok: false,
          error: `The file has more than ${MAX_STATEMENT_ROWS} lines. Export one month or one quarter at a time.`,
        };
      }
    }
    if (out.length === 0) {
      return { ok: false, error: "We found the columns but no line with a date and an amount." };
    }
    return { ok: true, rows: out, skipped };
  }

  const firstRow = splitCsv(text, text.includes(";") ? ";" : text.includes("\t") ? "\t" : ",")
    .find((r) => r.some((c) => c.trim() !== ""));
  const found = (firstRow ?? [])
    .map((c) => cleanText(c))
    .filter(Boolean)
    .slice(0, 8)
    .join(", ")
    .slice(0, 200);
  return {
    ok: false,
    error: `We couldn't read this file as a bank statement. ${EXPECTED}${found ? ` The first line has: ${found}.` : ""} An Excel file must be saved as CSV first.`,
  };
}

/**
 * The text that identifies one bank line for de-duplication: day, amount,
 * description and how many identical lines came before it in the same
 * file (two identical coffees on one day are two lines). The caller hashes
 * it. Importing the same file twice, or two overlapping files, adds
 * nothing twice.
 */
export function dedupeSources(rows: ParsedBankRow[], currencyFallback: string): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [
      r.bookedOn,
      r.amount.toFixed(2),
      r.currency ?? currencyFallback,
      r.description.toLowerCase().replace(/\s+/g, " "),
    ].join("|");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}
