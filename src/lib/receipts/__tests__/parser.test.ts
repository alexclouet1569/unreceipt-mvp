import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module before importing the parser so the parser picks
// up the mock when it imports llmExtract.
const mockLlmExtract = vi.fn();
vi.mock("../llm-extract", () => ({
  llmExtract: (...args: unknown[]) => mockLlmExtract(...args),
  _resetLlmExtractClientForTests: () => {},
}));

import { parseReceipt } from "../parser";

beforeEach(() => {
  mockLlmExtract.mockReset();
});

// --- Templates --------------------------------------------------------

describe("parseReceipt — email templates", () => {
  it("Uber template fully extracts a trip receipt without calling the LLM", async () => {
    const result = await parseReceipt({
      kind: "email",
      raw: {
        from: "receipts@uber.com",
        to: "alex+abc@in.unreceipt.com",
        subject: "Your Friday morning trip with Uber — 9 May 2026",
        text: [
          "Hi Alex,",
          "",
          "Thanks for choosing Uber.",
          "",
          "Total $24.90",
          "",
          "9 May 2026",
          "Trip from Hötorget to Arlanda Terminal 5.",
          "",
          "Payment: Visa •• 4242",
        ].join("\n"),
        html: null,
      },
    });
    expect(mockLlmExtract).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields.merchant_name).toBe("Uber");
    expect(result.fields.total).toBe(24.9);
    expect(result.fields.currency).toBe("USD");
    expect(result.fields.purchased_at.startsWith("2026-05-09")).toBe(true);
    expect(result.fields.card_last_four).toBe("4242");
    expect(result.fields.parse_confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("Stripe template extracts the canonical fields from a SaaS receipt", async () => {
    const result = await parseReceipt({
      kind: "email",
      raw: {
        from: "receipts@stripe.com",
        to: "alex+abc@in.unreceipt.com",
        subject: "Receipt from Acme SaaS [#1234-5678]",
        text: [
          "Receipt from Acme SaaS",
          "",
          "Amount paid: $49.00",
          "",
          "Date: 9 May 2026",
          "",
          "Card: •••• 4242",
          "",
          "Powered by Stripe.",
        ].join("\n"),
        html: null,
      },
    });
    expect(mockLlmExtract).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields.merchant_name).toBe("Acme SaaS");
    expect(result.fields.total).toBe(49);
    expect(result.fields.currency).toBe("USD");
    expect(result.fields.purchased_at.startsWith("2026-05-09")).toBe(true);
  });
});

describe("parseReceipt — SMS templates", () => {
  it("matches a Swedbank-style Köp SMS", async () => {
    const result = await parseReceipt({
      kind: "sms",
      raw: {
        from: "+46123456789",
        body: "Köp 194,00 kr hos ICA MAXI STOCKHOLM 2026-05-10 14:32",
      },
    });
    expect(mockLlmExtract).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields.merchant_name).toBe("ICA MAXI STOCKHOLM");
    expect(result.fields.total).toBe(194);
    expect(result.fields.currency).toBe("SEK");
    expect(result.fields.purchased_at).toBe("2026-05-10T14:32:00.000Z");
    expect(result.fields.payment_method).toBe("card");
  });

  it("handles SEB-style Kortköp with SEK before the amount", async () => {
    const result = await parseReceipt({
      kind: "sms",
      raw: {
        from: "SEB",
        body: "Kortköp SEK 49,00 hos PRESSBYRÅN T-CENTRAL 2026-05-09",
      },
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields.merchant_name).toBe("PRESSBYRÅN T-CENTRAL");
    expect(result.fields.total).toBe(49);
    expect(result.fields.currency).toBe("SEK");
  });
});

// --- LLM fallback -----------------------------------------------------

describe("parseReceipt — LLM fallback", () => {
  it("uses the LLM when no template matches an email", async () => {
    mockLlmExtract.mockResolvedValue({
      merchant: "Espresso House",
      amount: 75,
      currency: "SEK",
      receipt_date: "2026-05-10",
      receipt_time: "08:14",
      category: "meals",
      payment_method: "card",
      card_last_four: "4242",
      confidence: 0.92,
    });

    const result = await parseReceipt({
      kind: "email",
      raw: {
        from: "random@small-cafe.se",
        to: "alex+abc@in.unreceipt.com",
        subject: "Tack för ditt köp!",
        text: "Espresso House — Sergels Torg\nTotalt: 75 kr\n10 maj 2026 08:14\nKort •••• 4242",
        html: null,
      },
    });

    expect(mockLlmExtract).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields.merchant_name).toBe("Espresso House");
    expect(result.fields.total).toBe(75);
    expect(result.fields.currency).toBe("SEK");
    expect(result.fields.purchased_at).toBe("2026-05-10T08:14:00.000Z");
    expect(result.fields.category).toBe("meals");
    expect(result.fields.parse_confidence).toBe(0.92);
  });

  it("returns pending_review when the LLM reports low confidence", async () => {
    mockLlmExtract.mockResolvedValue({
      merchant: "Maybe a Café",
      amount: 75,
      currency: "SEK",
      receipt_date: "2026-05-10",
      confidence: 0.4,
    });

    const result = await parseReceipt({
      kind: "email",
      raw: {
        from: "random@unknown.example",
        to: "alex+abc@in.unreceipt.com",
        subject: "??",
        text: "ambiguous text",
        html: null,
      },
    });
    expect(result.status).toBe("pending_review");
  });

  it("returns pending_review when LLM says not_a_receipt", async () => {
    mockLlmExtract.mockResolvedValue({ not_a_receipt: true });
    const result = await parseReceipt({
      kind: "email",
      raw: {
        from: "newsletter@example.com",
        to: "alex+abc@in.unreceipt.com",
        subject: "Weekly digest",
        text: "Top stories this week …",
        html: null,
      },
    });
    expect(result.status).toBe("pending_review");
  });

  it("returns pending_review when required fields are missing", async () => {
    mockLlmExtract.mockResolvedValue({
      merchant: "Cafe",
      // missing amount + date
      currency: "SEK",
      confidence: 0.9,
    });
    const result = await parseReceipt({
      kind: "email",
      raw: {
        from: "random@example.com",
        to: "alex+abc@in.unreceipt.com",
        subject: "x",
        text: "x",
        html: null,
      },
    });
    expect(result.status).toBe("pending_review");
  });

  it("returns pending_review when an unknown SMS shape can't be parsed", async () => {
    mockLlmExtract.mockResolvedValue({
      merchant: "Unknown",
      confidence: 0.5,
    });
    const result = await parseReceipt({
      kind: "sms",
      raw: { from: "+46x", body: "completely free-form spam message" },
    });
    expect(result.status).toBe("pending_review");
  });
});

// --- Paper ------------------------------------------------------------

describe("parseReceipt — paper", () => {
  it("calls the LLM with OCR text and returns ok when confident", async () => {
    mockLlmExtract.mockResolvedValue({
      merchant: "ICA Maxi",
      amount: 194,
      currency: "SEK",
      receipt_date: "2026-05-10",
      tax_amount: 38.8,
      tax_rate: 25,
      confidence: 0.88,
    });

    const result = await parseReceipt({
      kind: "paper",
      raw: { ocrText: "ICA MAXI STOCKHOLM\nTOTAL 194,00 kr\n2026-05-10" },
    });

    expect(mockLlmExtract).toHaveBeenCalledWith(
      "paper",
      expect.stringContaining("ICA MAXI"),
      undefined
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields.tax_rate).toBe(25);
  });

  it("returns pending_review for empty OCR text", async () => {
    const result = await parseReceipt({
      kind: "paper",
      raw: { ocrText: "" },
    });
    expect(mockLlmExtract).not.toHaveBeenCalled();
    expect(result.status).toBe("pending_review");
  });
});
