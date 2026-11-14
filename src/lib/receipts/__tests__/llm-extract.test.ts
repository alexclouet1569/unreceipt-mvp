// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create };
  }
  return { default: MockAnthropic };
});

import { _resetLlmExtractClientForTests, llmExtract } from "../llm-extract";

describe("llmExtract", () => {
  beforeEach(() => {
    create.mockReset();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterEach(() => {
    _resetLlmExtractClientForTests();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("bounds the call so the email intake fits in its 60 s (20 s per attempt, one retry, overall deadline)", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: '{"merchant":"ICA","amount":49}' }] });

    await expect(llmExtract("email", "Total 49 kr")).resolves.toEqual({ merchant: "ICA", amount: 49 });

    const opts = create.mock.calls[0][1];
    expect(opts).toMatchObject({ timeout: 20_000, maxRetries: 1 });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("never echoes the model's answer in its error", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "ICA Maxi card 4242" }] });
    const err = await llmExtract("email", "x").catch((e: Error) => e);
    expect(String(err)).not.toContain("4242");
  });
});
