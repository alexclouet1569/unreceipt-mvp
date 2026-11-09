// Pairs a company's bank lines with its receipts, so the firm sees which
// payments have no receipt. Pure: no I/O, deterministic for the same data.
//
// Computed on every read, not stored: a receipt the client adds after the
// import matches by itself on the next view. Only the accountant's own
// decisions are stored on the bank line (a receipt linked by hand, or "no
// receipt needed").
//
// Automatic rule, money out only:
//   * same amount to the öre in the line's currency (the receipt's total,
//     or its home_total when the receipt was in another currency: from
//     FX_BELOW under to FX_ABOVE over an ECB estimate, because card issuers
//     add a markup and never a discount; exact for an amount typed from the
//     bank statement);
//   * the bank line dated from DAYS_BEFORE days before the receipt to
//     DAYS_AFTER days after it (card payments are booked a few days later,
//     invoices are paid weeks later);
//   * the best pairs win first: closest date, the merchant's name in the
//     bank text, an exact amount. One receipt pays one bank line.
// A receipt without an amount or a date never matches; it is still to be
// completed (review needed).

// Every payment needs a verifikation (BFL 5 kap. 6 §); "no receipt" means
// another document is it: the bank statement for a fee, the tax account
// statement, the payroll, the lender's notice, an invoice booked in the
// firm's own system. A municipal or other authority invoice is NOT
// covered by "tax": it carries VAT and needs the invoice. The labels say
// which document stands in.
export type NoReceiptReason = "bank_fee" | "transfer" | "tax" | "salary" | "loan" | "invoice_elsewhere" | "other";

export const NO_RECEIPT_REASONS: Array<{ key: NoReceiptReason; label: string }> = [
  { key: "bank_fee", label: "Bank fee (the statement is the verifikation)" },
  { key: "transfer", label: "Transfer between own accounts" },
  { key: "tax", label: "Skatteverket tax account" },
  { key: "salary", label: "Salary (payroll is the verifikation)" },
  { key: "loan", label: "Loan or interest (lender's notice)" },
  { key: "invoice_elsewhere", label: "Supplier invoice booked outside UnReceipt" },
  { key: "other", label: "Another document is the verifikation" },
];

export function isNoReceiptReason(v: unknown): v is NoReceiptReason {
  return typeof v === "string" && NO_RECEIPT_REASONS.some((r) => r.key === v);
}

export type MatchTransaction = {
  id: string;
  bookedOn: string; // YYYY-MM-DD
  amount: number; // negative = money out
  currency: string;
  description: string;
  linkedReceiptId: string | null;
  noReceiptReason: NoReceiptReason | null;
};

export type MatchReceipt = {
  id: string;
  day: string | null; // YYYY-MM-DD
  total: number | null;
  currency: string;
  homeTotal: number | null;
  homeCurrency: string | null;
  fxSource: "same" | "ecb" | "manual" | null;
  merchant: string | null;
  // Still in Review needed: it matches, but nobody has confirmed it yet,
  // so the firm sees "receipt to confirm" rather than a settled payment.
  pending?: boolean;
};

export type TransactionState =
  | { kind: "matched"; receiptId: string; how: "auto" | "manual" }
  | { kind: "no_receipt"; reason: NoReceiptReason }
  | { kind: "missing" }
  | { kind: "money_in" };

export const DAYS_BEFORE = 3;
export const DAYS_AFTER = 45;
export const FX_ABOVE = 0.03;
export const FX_BELOW = 0.01;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NAME_STOP_WORDS = new Set(["ab", "hb", "kb", "sas", "sarl", "the", "och", "and", "gmbh", "ltd", "inc", "sverige", "sweden", "france", "store", "shop"]);

/** The merchant's name (a word of 3+ letters, or the whole name) appears in the bank text. */
export function nameAppears(merchant: string | null, description: string): boolean {
  if (!merchant) return false;
  const text = ` ${fold(description)} `;
  const name = fold(merchant);
  if (name.length >= 3 && text.includes(` ${name} `)) return true;
  return name
    .split(" ")
    .filter((w) => w.length >= 3 && !NAME_STOP_WORDS.has(w))
    .some((w) => text.includes(` ${w}`));
}

/** The receipt's amount in `currency`, and whether it is an estimate. */
function receiptAmountIn(r: MatchReceipt, currency: string): { amount: number; estimate: boolean } | null {
  if (r.total == null || !Number.isFinite(r.total)) return null;
  if (r.currency === currency) return { amount: r.total, estimate: false };
  if (r.homeCurrency === currency && r.homeTotal != null && Number.isFinite(r.homeTotal)) {
    return { amount: r.homeTotal, estimate: r.fxSource !== "manual" };
  }
  return null;
}

/** Lower is better; null when the pair can't match. */
export function pairScore(tx: MatchTransaction, r: MatchReceipt): number | null {
  if (!r.day) return null;
  const amt = receiptAmountIn(r, tx.currency);
  if (!amt) return null;
  const paid = -tx.amount;
  if (amt.estimate) {
    if (paid > amt.amount * (1 + FX_ABOVE) || paid < amt.amount * (1 - FX_BELOW)) return null;
  } else if (Math.abs(paid - amt.amount) > 0.005) {
    return null;
  }
  const delta = dayNumber(tx.bookedOn) - dayNumber(r.day);
  if (delta < -DAYS_BEFORE || delta > DAYS_AFTER) return null;
  let score = delta < 0 ? -delta * 2 : delta;
  if (amt.estimate) score += 2;
  if (nameAppears(r.merchant, tx.description)) score -= 5;
  return score;
}

export function matchTransactions(
  transactions: MatchTransaction[],
  receipts: MatchReceipt[]
): { states: Map<string, TransactionState>; usedReceiptIds: Set<string> } {
  const states = new Map<string, TransactionState>();
  const used = new Set<string>();
  const receiptIds = new Set(receipts.map((r) => r.id));

  // The accountant's decisions first; a link to a receipt that's gone (or
  // already used by another line) counts as no link.
  for (const tx of transactions) {
    if (tx.noReceiptReason) {
      states.set(tx.id, { kind: "no_receipt", reason: tx.noReceiptReason });
    } else if (tx.linkedReceiptId && receiptIds.has(tx.linkedReceiptId) && !used.has(tx.linkedReceiptId)) {
      states.set(tx.id, { kind: "matched", receiptId: tx.linkedReceiptId, how: "manual" });
      used.add(tx.linkedReceiptId);
    } else if (tx.amount >= 0) {
      states.set(tx.id, { kind: "money_in" });
    }
  }

  const open = transactions.filter((tx) => !states.has(tx.id));
  const free = receipts.filter((r) => !used.has(r.id));
  const pairs: Array<{ tx: MatchTransaction; r: MatchReceipt; score: number }> = [];
  for (const tx of open) {
    for (const r of free) {
      const score = pairScore(tx, r);
      if (score !== null) pairs.push({ tx, r, score });
    }
  }
  pairs.sort(
    (a, b) =>
      a.score - b.score ||
      a.tx.bookedOn.localeCompare(b.tx.bookedOn) ||
      a.tx.id.localeCompare(b.tx.id) ||
      a.r.id.localeCompare(b.r.id)
  );
  for (const { tx, r } of pairs) {
    if (states.has(tx.id) || used.has(r.id)) continue;
    states.set(tx.id, { kind: "matched", receiptId: r.id, how: "auto" });
    used.add(r.id);
  }
  for (const tx of open) {
    if (!states.has(tx.id)) states.set(tx.id, { kind: "missing" });
  }
  return { states, usedReceiptIds: used };
}
