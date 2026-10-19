/**
 * The email that asks a client for their missing receipts. Pure.
 *
 * Sent on the accounting firm's behalf, in the client's language. Its
 * Reply-To is the client's own UnReceipt forwarding address, so a reply
 * with photos lands in their receipts and is matched again — the client
 * never logs in to anything.
 */

import type { StatementLine } from "./parse-statement";

export type ReminderLocale = "sv" | "en";

export type ReminderInput = {
  locale: ReminderLocale;
  clientFirstName: string;
  firmName: string;
  /** "YYYY-MM". */
  period: string;
  missing: Pick<StatementLine, "date" | "text" | "amount" | "currency">[];
};

export type ReminderEmail = { subject: string; text: string };

const INTL: Record<ReminderLocale, string> = { sv: "sv-SE", en: "en-GB" };

export function periodLabel(period: string, locale: ReminderLocale): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(INTL[locale], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso: string, locale: ReminderLocale): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(INTL[locale], {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function money(amount: number, currency: string, locale: ReminderLocale): string {
  const n = Math.abs(amount).toLocaleString(INTL[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "SEK" ? `${n} kr` : `${n} ${currency}`;
}

export function buildReminderEmail(input: ReminderInput): ReminderEmail {
  const { locale, clientFirstName, firmName, missing } = input;
  const month = periodLabel(input.period, locale);
  const list = missing
    .map((m) => `• ${shortDate(m.date, locale)} · ${m.text} · ${money(m.amount, m.currency, locale)}`)
    .join("\n");
  const n = missing.length;

  if (locale === "sv") {
    return {
      subject: `${n === 1 ? "1 kvitto saknas" : `${n} kvitton saknas`} för ${month}`,
      text: [
        `Hej ${clientFirstName},`,
        "",
        `Vi går igenom bokföringen för ${month} och saknar ${n === 1 ? "kvitto för det här köpet" : "kvitton för de här köpen"}:`,
        "",
        list,
        "",
        "Svara på det här mejlet med en bild på kvittot, eller vidarebefordra e-kvittot hit. Flera bilder i samma svar går bra.",
        "",
        "Hittar du inte ett kvitto? Svara och skriv kort vad köpet gällde, så hjälper vi dig vidare.",
        "",
        "Vänliga hälsningar",
        firmName,
      ].join("\n"),
    };
  }

  return {
    subject: `${n === 1 ? "1 receipt" : `${n} receipts`} missing for ${month}`,
    text: [
      `Hi ${clientFirstName},`,
      "",
      `We're doing the books for ${month} and are missing ${n === 1 ? "the receipt for this purchase" : "receipts for these purchases"}:`,
      "",
      list,
      "",
      "Reply to this email with a photo of each receipt, or forward the email receipt here. Several photos in one reply is fine.",
      "",
      "Can't find one? Reply with a short note on what the purchase was, and we'll take it from there.",
      "",
      "Kind regards",
      firmName,
    ].join("\n"),
  };
}
