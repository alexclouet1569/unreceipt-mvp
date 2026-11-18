// Keeps full payment card numbers out of what we store. Pure; safe anywhere.
//
// UnReceipt never needs a card number: Stripe holds the cards it charges,
// and a receipt only needs the last four digits (receipts.card_last_four).
// Receipts print masked numbers, but OCR, an email's text or a person typing
// can still produce a full one, and a stored card number would put us in
// PCI DSS scope and make any leak far worse. So every write path runs its
// free text through these. The stored original file (the evidence) is left
// as it was received.

/** Luhn checksum, the check digit every payment card number carries. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// A run of digit groups separated by single spaces or dashes ("4111 1111
// 1111 1111 12/26" gives "4111 1111 1111 1111 12"). The card number can be
// any whole groups inside it, so each run is searched group by group.
const DIGIT_GROUPS = /\d+(?:[ -]\d+)*/g;

/**
 * Replaces every card-shaped number (13–19 digits that pass the Luhn check)
 * with "•••• " and its last four digits, also when other numbers sit next
 * to it (an expiry date, a CVC, a reference). A card number is whole digit
 * groups: a single unbroken run longer than 19 digits (a payment
 * reference) is never cut into one. Other numbers (org.nr, OCR reference,
 * phone) are left alone: they rarely pass Luhn at card length, and when one
 * does, losing its middle digits costs little.
 */
export function maskCardNumbers(text: string): string {
  return text.replace(DIGIT_GROUPS, (run) => {
    const groups = run.split(/[ -]/);
    const seps = run.match(/[ -]/g) ?? [];
    if (groups.join("").length < 13) return run;
    let out = "";
    let i = 0;
    while (i < groups.length) {
      let end = -1;
      let digits = "";
      for (let j = i; j < groups.length; j++) {
        digits += groups[j];
        if (digits.length > 19) break;
        if (digits.length >= 13 && luhnValid(digits)) {
          end = j;
          break;
        }
      }
      if (end >= 0) {
        const card = groups.slice(i, end + 1).join("");
        out += `•••• ${card.slice(-4)}`;
        i = end + 1;
      } else {
        out += groups[i];
        i += 1;
      }
      if (i < groups.length) out += seps[i - 1];
    }
    return out;
  });
}

/** maskCardNumbers() for a nullable field. */
export function maskCardNumbersOrNull<T extends string | null | undefined>(text: T): T {
  return (typeof text === "string" ? maskCardNumbers(text) : text) as T;
}

/**
 * Payment method as read or typed, without anything that could be a card
 * number: runs of 7+ digits (spaces or dashes inside) become "•••". A
 * payment method is a word ("Card", "Swish", "Visa •••• 4821"), never a
 * long number, so this is stricter than maskCardNumbers().
 */
export function maskDigitRuns(text: string): string {
  return text.replace(/\d(?:[ -]?\d){6,}/g, "•••");
}

/** Payment method from an untrusted source (OCR, email): masked, trimmed, at most 50 characters. */
export function safePaymentMethod(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = maskDigitRuns(v).trim().slice(0, 50);
  return s || null;
}
