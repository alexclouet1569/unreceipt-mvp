/**
 * Reads a bank statement export (CSV) into statement lines. Pure, so it
 * runs in the browser as well as on the server.
 *
 * Swedish banks each export a different layout: `;` or `,` between fields,
 * a title row or two above the header, decimal comma or point, ISO or
 * compact dates. Rather than one parser per bank, this finds the header row
 * by its column names (Swedish or English) and reads the date, text and
 * amount columns from it. Money out is negative, as every bank shows it.
 */

export type StatementLine = {
  /** Stable within one statement: "L1", "L2"… in file order. */
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** The bank's own text, e.g. "KORTKÖP 260903 CIRCLE K MALMO". */
  text: string;
  /** Money out is negative. */
  amount: number;
  currency: string;
};

export type ParsedStatement = {
  lines: StatementLine[];
  /** Data rows we couldn't read, 1-based row number in the file. */
  skipped: { row: number; reason: string }[];
  /** The header names we read each field from, as written in the file. */
  columns: { date: string; text: string; amount: string };
};

export class StatementParseError extends Error {}

// In order of preference: the purchase date beats the booking date, since
// that's the date printed on the receipt.
const DATE_HEADERS = [
  "transaktionsdag",
  "transaktionsdatum",
  "köpdatum",
  "datum",
  "bokföringsdag",
  "bokföringsdatum",
  "bokförd",
  "reskontradatum",
  "valutadag",
  "valutadatum",
  "transaction date",
  "date",
  "booking date",
];
const TEXT_HEADERS = [
  "beskrivning",
  "text",
  "text/mottagare",
  "text / mottagare",
  "rubrik",
  "transaktionstext",
  "specifikation",
  "mottagare",
  "namn",
  "referens",
  "meddelande",
  "description",
  "text/description",
];
const AMOUNT_HEADERS = ["belopp", "belopp sek", "belopp (sek)", "amount", "summa"];
const CURRENCY_HEADERS = ["valuta", "currency"];

const DELIMITERS = [";", ",", "\t"] as const;
// Title rows above the header ("* Transaktioner Period 2026-09-01–…").
const MAX_HEADER_ROW = 15;

function normHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Splits CSV text into rows of cells. Handles quotes, "" and quoted newlines. */
export function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  // A quote opens a quoted field only before any other character in it.
  // Tracked as a flag: re-checking `cell` on every quote is quadratic.
  let cellStarted = false;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
      cell = "";
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
      cellStarted = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      cellStarted = false;
    } else {
      cell += c;
      if (c !== " " && c !== "\t") cellStarted = true;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function findColumn(headers: string[], wanted: string[]): number {
  for (const name of wanted) {
    const i = headers.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

type Header = {
  row: number;
  date: number;
  text: number;
  amount: number;
  currency: number;
  names: string[];
};

function findHeader(rows: string[][]): Header | null {
  for (let r = 0; r < Math.min(rows.length, MAX_HEADER_ROW); r++) {
    const names = rows[r].map(normHeader);
    const date = findColumn(names, DATE_HEADERS);
    const amount = findColumn(names, AMOUNT_HEADERS);
    const text = findColumn(names, TEXT_HEADERS);
    if (date !== -1 && amount !== -1 && text !== -1) {
      return { row: r, date, text, amount, currency: findColumn(names, CURRENCY_HEADERS), names };
    }
  }
  return null;
}

/**
 * "-1 234,50", "−1234.50", "1.234,50 kr", "245,00-" → number. Null when it
 * isn't an amount.
 */
export function parseAmount(raw: string): number | null {
  let s = raw
    .trim()
    .replace(/[  \s]/g, "")
    .replace(/−/g, "-")
    .replace(/(kr|sek)$/i, "");
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // Both: the later one is the decimal separator.
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma !== -1) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) && !/,\d{2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot !== -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

function isoIfValid(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** "2026-09-03", "2026/09/03", "20260903", "26-09-03", "03.09.2026" → "2026-09-03". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})(?:[ T].*)?$/);
  if (m) return isoIfValid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return isoIfValid(2000 + +m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return isoIfValid(+m[3], +m[2], +m[1]);
  return null;
}

/**
 * File bytes → text. Several Swedish banks still export Windows-1252, where
 * "Bokföringsdag" would come out garbled as UTF-8 and no header would match.
 */
export function decodeStatementFile(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseStatement(fileText: string, defaultCurrency = "SEK"): ParsedStatement {
  const text = fileText.replace(/^﻿/, "");

  let best: { rows: string[][]; header: Header } | null = null;
  for (const delimiter of DELIMITERS) {
    const rows = splitCsv(text, delimiter);
    const header = findHeader(rows);
    if (header && (!best || header.names.length > best.header.names.length)) {
      best = { rows, header };
    }
  }
  if (!best) {
    throw new StatementParseError(
      "Couldn't find the date, text and amount columns. Export the statement as CSV with column headers.",
    );
  }

  const { rows, header } = best;
  const lines: StatementLine[] = [];
  const skipped: ParsedStatement["skipped"] = [];

  for (let r = header.row + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => c.trim() === "")) continue;
    const rowNo = r + 1;
    const date = parseDate(row[header.date] ?? "");
    if (!date) {
      skipped.push({ row: rowNo, reason: "No readable date" });
      continue;
    }
    const amount = parseAmount(row[header.amount] ?? "");
    if (amount == null) {
      skipped.push({ row: rowNo, reason: "No readable amount" });
      continue;
    }
    const currency =
      header.currency !== -1 && /^[A-Z]{3}$/.test((row[header.currency] ?? "").trim())
        ? row[header.currency].trim()
        : defaultCurrency;
    lines.push({
      id: `L${lines.length + 1}`,
      date,
      text: (row[header.text] ?? "").trim().replace(/\s+/g, " "),
      amount,
      currency,
    });
  }

  return {
    lines,
    skipped,
    columns: {
      date: rows[header.row][header.date].trim(),
      text: rows[header.row][header.text].trim(),
      amount: rows[header.row][header.amount].trim(),
    },
  };
}
