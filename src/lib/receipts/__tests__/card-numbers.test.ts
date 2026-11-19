import { describe, expect, it } from "vitest";
import {
  luhnValid,
  maskCardNumbers,
  maskCardNumbersOrNull,
  maskDigitRuns,
  safePaymentMethod,
} from "@/lib/receipts/card-numbers";
import { PaymentMethodSchema, ReceiptItemSchema } from "@/lib/receipts/receipt-fields";

// Public test card numbers (Stripe's documentation), never real cards.
const VISA = "4242424242424242";
const MASTERCARD = "5555555555554444";
const AMEX = "378282246310005";

describe("luhnValid", () => {
  it("accepts test card numbers and rejects a changed digit", () => {
    expect(luhnValid(VISA)).toBe(true);
    expect(luhnValid(MASTERCARD)).toBe(true);
    expect(luhnValid(AMEX)).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
    expect(luhnValid("42424242a2424242")).toBe(false);
  });
});

describe("maskCardNumbers", () => {
  it("masks a card number written whole, with spaces or with dashes", () => {
    expect(maskCardNumbers(`Card ${VISA} approved`)).toBe("Card •••• 4242 approved");
    expect(maskCardNumbers("4242 4242 4242 4242")).toBe("•••• 4242");
    expect(maskCardNumbers("5555-5555-5555-4444")).toBe("•••• 4444");
    expect(maskCardNumbers(`Amex ${AMEX}`)).toBe("Amex •••• 0005");
  });

  it("finds a card number next to an expiry date, a CVC or a reference", () => {
    expect(maskCardNumbers("Visa 4111 1111 1111 1111 12/26")).toBe("Visa •••• 1111 12/26");
    expect(maskCardNumbers("4111-1111-1111-1111 123")).toBe("•••• 1111 123");
    expect(maskCardNumbers("ref 12 4111 1111 1111 1111")).toBe("ref 12 •••• 1111");
    expect(maskCardNumbers("card 4111111111111111 cvv 123")).toBe("card •••• 1111 cvv 123");
    expect(maskCardNumbers("12 34 56 4242 4242 4242 4242 99")).toBe("12 34 56 •••• 4242 99");
  });

  it("leaves numbers that aren't card numbers alone", () => {
    expect(maskCardNumbers("Org.nr 556677-8899")).toBe("Org.nr 556677-8899");
    expect(maskCardNumbers("Ref 4242424242424241")).toBe("Ref 4242424242424241");
    // Part of a longer number (a 22-digit payment reference) is not a card.
    expect(maskCardNumbers(`OCR 123456${VISA}`)).toBe(`OCR 123456${VISA}`);
    expect(maskCardNumbers("Visa •••• 4821")).toBe("Visa •••• 4821");
    expect(maskCardNumbers("2026-11-18 070-123 45 67")).toBe("2026-11-18 070-123 45 67");
  });

  it("passes null and undefined through", () => {
    expect(maskCardNumbersOrNull(null)).toBeNull();
    expect(maskCardNumbersOrNull(undefined)).toBeUndefined();
    expect(maskCardNumbersOrNull(VISA)).toBe("•••• 4242");
  });
});

describe("payment method", () => {
  it("masks any run of 7+ digits", () => {
    expect(maskDigitRuns(`Visa ${VISA}`)).toBe("Visa •••");
    expect(safePaymentMethod("Mastercard 5555 5555 5555 4444")).toBe("Mastercard •••");
    expect(safePaymentMethod("Swish")).toBe("Swish");
    expect(safePaymentMethod(42)).toBeNull();
  });

  it("is masked when typed in a form (PaymentMethodSchema)", () => {
    expect(PaymentMethodSchema.parse(`  Card ${VISA} `)).toBe("Card •••");
    expect(PaymentMethodSchema.parse("Visa •••• 4821")).toBe("Visa •••• 4821");
  });
});

describe("line items", () => {
  it("never store a card number in a line's label", () => {
    const item = ReceiptItemSchema.parse({ label: `Paid with ${VISA}`, total_amount: 10 });
    expect(item.label).toBe("Paid with •••• 4242");
  });
});
