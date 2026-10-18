// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mocks.create };
  }
  return { default: MockAnthropic };
});

const importOcr = async () => await import("@/lib/ocr");

describe("extractReceipt", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  afterEach(async () => {
    const ocr = await importOcr();
    ocr._resetOcrClientForTests();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("throws fast when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { extractReceipt, _resetOcrClientForTests } = await importOcr();
    _resetOcrClientForTests();
    await expect(extractReceipt("aGVsbG8=", "image/jpeg")).rejects.toThrow(
      /ANTHROPIC_API_KEY missing/
    );
  });

  it("sends the cached system prompt + image content and parses JSON", async () => {
    mocks.create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"merchant":"ICA","amount":49.5,"currency":"SEK","receipt_date":"2026-05-03","category":"meals"}',
        },
      ],
    });

    const { extractReceipt } = await importOcr();
    const result = await extractReceipt("BASE64DATA", "image/png");

    expect(result).toEqual({
      merchant: "ICA",
      amount: 49.5,
      currency: "SEK",
      receipt_date: "2026-05-03",
      category: "meals",
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const call = mocks.create.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.system[0].text).toMatch(/receipt OCR extractor/i);
    expect(call.messages[0].role).toBe("user");
    const blocks = call.messages[0].content;
    expect(blocks[0].type).toBe("image");
    expect(blocks[0].source).toEqual({
      type: "base64",
      media_type: "image/png",
      data: "BASE64DATA",
    });
    expect(blocks[1].type).toBe("text");
  });

  it("strips a ```json code fence the model might wrap output in", async () => {
    mocks.create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '```json\n{"merchant":"Stripe"}\n```',
        },
      ],
    });
    const { extractReceipt } = await importOcr();
    const result = await extractReceipt("x", "image/jpeg");
    expect(result).toEqual({ merchant: "Stripe" });
  });

  it("returns not_a_receipt passthrough", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: '{"not_a_receipt":true}' }],
    });
    const { extractReceipt } = await importOcr();
    const result = await extractReceipt("x", "image/jpeg");
    expect(result).toEqual({ not_a_receipt: true });
  });

  it("throws on non-JSON model output", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: "I cannot read that receipt." }],
    });
    const { extractReceipt } = await importOcr();
    await expect(extractReceipt("x", "image/jpeg")).rejects.toThrow(
      /OCR returned non-JSON/
    );
  });

  it("sends a document content block when the media_type is application/pdf", async () => {
    mocks.create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"merchant":"Stripe","amount":29,"currency":"USD","receipt_date":"2026-05-10","category":"software"}',
        },
      ],
    });

    const { extractReceipt } = await importOcr();
    const result = await extractReceipt("PDFBASE64", "application/pdf");

    expect(result).toEqual({
      merchant: "Stripe",
      amount: 29,
      currency: "USD",
      receipt_date: "2026-05-10",
      category: "software",
    });

    const call = mocks.create.mock.calls[0][0];
    const block = call.messages[0].content[0];
    expect(block.type).toBe("document");
    expect(block.source).toEqual({
      type: "base64",
      media_type: "application/pdf",
      data: "PDFBASE64",
    });
  });

  it("throws when the model response has no text block", async () => {
    mocks.create.mockResolvedValue({ content: [] });
    const { extractReceipt } = await importOcr();
    await expect(extractReceipt("x", "image/jpeg")).rejects.toThrow(
      /no text content/
    );
  });
});

describe("extractReceiptCall", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  afterEach(async () => {
    const ocr = await importOcr();
    ocr._resetOcrClientForTests();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("passes eval options through and returns the served model and usage", async () => {
    mocks.create.mockResolvedValue({
      model: "claude-haiku-5-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 90 },
      content: [{ type: "text", text: '{"amount":49.5}' }],
    });
    const { extractReceiptCall } = await importOcr();
    const call = await extractReceiptCall("x", "image/jpeg", {
      model: "claude-haiku-5-5",
      effort: "low",
      maxTokens: 16000,
    });

    expect(call).toEqual({
      result: { amount: 49.5 },
      model: "claude-haiku-5-5",
      stopReason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 90 },
    });
    const req = mocks.create.mock.calls[0][0];
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(16000);
    expect(req.output_config).toEqual({ effort: "low" });
  });

  it("sends no output_config when no effort is given", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: "{}" }],
    });
    const { extractReceiptCall } = await importOcr();
    await extractReceiptCall("x", "image/jpeg");
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("output_config");
  });

  it("keeps the billed usage on an unusable answer", async () => {
    mocks.create.mockResolvedValue({
      model: "claude-sonnet-4-6",
      stop_reason: "max_tokens",
      usage: { input_tokens: 1500, output_tokens: 4096 },
      content: [{ type: "text", text: '{"items":[' }],
    });
    const { extractReceiptCall, OcrOutputError } = await importOcr();
    const err = await extractReceiptCall("x", "image/jpeg").catch((e) => e);
    expect(err).toBeInstanceOf(OcrOutputError);
    expect(err.call).toEqual({
      model: "claude-sonnet-4-6",
      stopReason: "max_tokens",
      usage: { input_tokens: 1500, output_tokens: 4096 },
    });
  });
});

