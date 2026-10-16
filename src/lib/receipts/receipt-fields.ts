/**
 * Validation for the receipt fields a person can type or confirm: shared by
 * /api/capture (new receipts) and PATCH /api/receipts/[id] (edits), so both
 * accept exactly the same values. Pure — safe to import from any layer.
 */

import { z } from "zod";

export const MAX_AMOUNT = 1_000_000;
export const MAX_ITEMS = 200;

export const ReceiptItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  qty: z.number().positive().max(10_000).nullable().optional(),
  unit_amount: z.number().nonnegative().max(MAX_AMOUNT).nullable().optional(),
  total_amount: z.number().nonnegative().max(MAX_AMOUNT),
});

export const ReceiptItemsSchema = z.array(ReceiptItemSchema).max(MAX_ITEMS);

// VAT (moms) amount in the receipt's currency. Zero is a real value
// (VAT-exempt purchases), so it's allowed.
export const TaxAmountSchema = z.number().nonnegative().max(MAX_AMOUNT);

// VAT rate as a percentage, e.g. 25, 12, 6.
export const TaxRateSchema = z.number().min(0).max(100);

// Free text ("Card", "Swish", "Amex ending 1234"…), kept short so it fits
// one line on the PDF.
export const PaymentMethodSchema = z.string().trim().min(1).max(50);

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

// Fields the Swedish VAT check reads (src/lib/compliance/se-vat-check.ts).
// The seller's VAT number ("SE556677889901") or organisation number
// ("556677-8899"); who the receipt is billed to; the VAT per rate.
export const SellerIdSchema = z.string().trim().min(2).max(40);
export const BuyerNameSchema = z.string().trim().min(1).max(200);
export const BuyerAddressSchema = z.string().trim().min(1).max(300);
export const VatBreakdownSchema = z
  .array(
    z.object({
      rate: TaxRateSchema,
      vat_amount: TaxAmountSchema,
    }),
  )
  .max(5);

export const VatDetailsSchema = z.object({
  merchant_vat_number: SellerIdSchema.optional(),
  merchant_org_number: SellerIdSchema.optional(),
  buyer_name: BuyerNameSchema.optional(),
  buyer_address: BuyerAddressSchema.optional(),
  vat_breakdown: VatBreakdownSchema.optional(),
});
export type VatDetails = z.infer<typeof VatDetailsSchema>;

/**
 * The VAT check fields from a reader's output, keeping each valid one and
 * dropping the rest: one misread field shouldn't lose the others. A card
 * number never ends up here: the readers return only its last four digits,
 * in another field.
 */
export function pickVatDetails(raw: unknown): VatDetails {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const out: VatDetails = {};
  const take = <K extends keyof VatDetails>(key: K, schema: z.ZodType<VatDetails[K]>) => {
    const parsed = schema.safeParse(source[key]);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  };
  take("merchant_vat_number", SellerIdSchema);
  take("merchant_org_number", SellerIdSchema);
  take("buyer_name", BuyerNameSchema);
  take("buyer_address", BuyerAddressSchema);
  const breakdown = VatBreakdownSchema.safeParse(source.vat_breakdown);
  if (breakdown.success && breakdown.data.length > 0) out.vat_breakdown = breakdown.data;
  return out;
}
