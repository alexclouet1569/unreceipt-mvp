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

  it("throws when the model response has no text block", async () => {
    mocks.create.mockResolvedValue({ content: [] });
    const { extractReceipt } = await importOcr();
    await expect(extractReceipt("x", "image/jpeg")).rejects.toThrow(
      /no text content/
    );
  });
});
