/**
 * Validation for the receipt fields a person can type or confirm: shared by
 * /api/capture (new receipts) and PATCH /api/receipts/[id] (edits), so both
 * accept exactly the same values. Pure — safe to import from any layer.
 */

import { z } from "zod";

// zod sets its English messages as a side effect of its entry module, which
// the production bundle can skip (zod declares "sideEffects": false). Without
// this every validation error without a message of its own reads just
// "Invalid input". The schemas below carry their own wording; this is the
// fallback for everything else.
z.config(z.locales.en());

export const MAX_AMOUNT = 1_000_000;
export const MAX_ITEMS = 200;

// Discount and deposit-return lines ("Rabatt -10,00", "Pant retur") are
// negative, and they are real lines of the receipt.
export const ReceiptItemSchema = z.object({
  label: z
    .string({ error: "Every line needs a description" })
    .trim()
    .min(1, "Every line needs a description")
    .max(200, "A line description can be at most 200 characters"),
  qty: z.number().positive().max(10_000).nullable().optional(),
  unit_amount: z.number().min(-MAX_AMOUNT).max(MAX_AMOUNT).nullable().optional(),
  total_amount: z
    .number({ error: "Enter an amount for every line" })
    .min(-MAX_AMOUNT, "Enter an amount for every line")
    .max(MAX_AMOUNT, "Enter an amount for every line"),
});

export const ReceiptItemsSchema = z
  .array(ReceiptItemSchema)
  .max(MAX_ITEMS, `A receipt can have at most ${MAX_ITEMS} lines`);

/**
 * Line items read by OCR are a bonus on top of the receipt: a line the model
 * read oddly (no label, a quantity of 0) is dropped rather than blocking the
 * save. Returns undefined when nothing usable is left.
 */
export function usableItems(raw: unknown): z.infer<typeof ReceiptItemsSchema> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .slice(0, MAX_ITEMS)
    .flatMap((item) => {
      const parsed = ReceiptItemSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  return items.length > 0 ? items : undefined;
}

// VAT (moms) amount in the receipt's currency. Zero is a real value
// (VAT-exempt purchases), so it's allowed.
export const TaxAmountSchema = z
  .number({ error: "Enter VAT as an amount" })
  .nonnegative("VAT can't be negative")
  .max(MAX_AMOUNT, "VAT is too large");

// VAT rate as a percentage, e.g. 25, 12, 6.
export const TaxRateSchema = z
  .number({ error: "Enter the VAT rate as a percentage" })
  .min(0, "The VAT rate must be between 0 and 100 %")
  .max(100, "The VAT rate must be between 0 and 100 %");

// Free text ("Card", "Swish", "Amex ending 1234"…), kept short so it fits
// one line on the PDF.
export const PaymentMethodSchema = z
  .string()
  .trim()
  .min(1)
  .max(50, "Payment can be at most 50 characters");

// Offered as suggestions in the forms; any other short text is accepted.
export const PAYMENT_METHOD_SUGGESTIONS = [
  "Card",
  "Cash",
  "Swish",
  "Klarna",
  "Invoice",
] as const;

/** VAT can't be more than the total it is part of. */
export function taxExceedsTotal(
  taxAmount: number | null | undefined,
  total: number | null | undefined,
): boolean {
  return taxAmount != null && total != null && taxAmount > total;
}

/**
 * The VAT contained in a VAT-inclusive total at the given rate, rounded to
 * cents (245 at 25 % → 49). Receipt totals always include VAT.
 */
export function vatFromGross(gross: number, ratePercent: number): number {
  return Math.round(((gross * ratePercent) / (100 + ratePercent)) * 100) / 100;
}

/**
 * Reads an optional number from a form value. Empty or missing → undefined
 * (the field wasn't filled); anything else → Number(), which zod then
 * rejects if it's NaN. Accepts a decimal comma ("12,50") because Swedish
 * keyboards and receipts use one.
 */
export function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed.replace(",", "."));
}

/** Reads an optional trimmed string from a form value. */
export function optionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
