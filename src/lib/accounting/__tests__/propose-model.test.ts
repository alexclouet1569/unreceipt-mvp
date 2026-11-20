import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  buildUserMessage,
  candidateAccounts,
  chooseAccountWithModel,
  parseModelChoice,
} from "@/lib/accounting/propose-model";
import type { FortnoxAccount } from "@/lib/accounting/types";

vi.mock("@/lib/ai-usage", () => ({ recordAiUsage: vi.fn() }));

const accounts = new Map<string, FortnoxAccount>([
  ["1930", { number: "1930", description: "Företagskonto", active: true }],
  ["6540", { number: "6540", description: "IT-tjänster", active: true }],
  ["6990", { number: "6990", description: "Övriga externa kostnader", active: true }],
  ["5410", { number: "5410", description: "Förbrukningsinventarier", active: false }],
]);

function message(text: string, stop: Anthropic.Message["stop_reason"] = "end_turn"): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  } as unknown as Anthropic.Message;
}

describe("propose-model", () => {
  it("offers only active cost accounts", () => {
    expect(candidateAccounts(accounts).map((a) => a.number)).toEqual(["6540", "6990"]);
  });

  it("accepts only an offered account", () => {
    const allowed = new Set(["6540", "6990"]);
    expect(parseModelChoice('{"account":"6540","reason":"Molntjänst","confidence":0.8}', allowed)).toEqual({
      account: "6540",
      reason: "Molntjänst",
      confidence: 0.8,
    });
    expect(parseModelChoice('{"account":"1930","reason":"x","confidence":1}', allowed)).toBeNull();
    expect(parseModelChoice("I think 6540", allowed)).toBeNull();
    expect(parseModelChoice('{"account":"6540"}', allowed)?.confidence).toBe(0.5);
  });

  it("puts the receipt and the chart in the message, never more than 10 items", () => {
    const text = buildUserMessage(
      {
        merchant_name: "Hetzner Online GmbH",
        category: "other",
        currency: "EUR",
        total: 12,
        items: Array.from({ length: 15 }, (_, i) => ({ label: `line ${i}` })) as never,
      },
      candidateAccounts(accounts),
      [{ merchant: "github", account: "6540" }],
    );
    expect(text).toContain("merchant: Hetzner Online GmbH");
    expect(text).toContain("6540 IT-tjänster");
    expect(text).toContain("github → 6540");
    expect(text).not.toContain("line 10");
  });

  it("returns null on a failed call or a cut-off answer", async () => {
    const receipt = { merchant_name: "X", category: "other" as const, items: null, currency: "SEK", total: 1 };
    await expect(chooseAccountWithModel(receipt, accounts, [], async () => { throw new Error("down"); })).resolves.toBeNull();
    await expect(
      chooseAccountWithModel(receipt, accounts, [], async () => message('{"account":"6540"', "max_tokens")),
    ).resolves.toBeNull();
    await expect(
      chooseAccountWithModel(receipt, accounts, [], async () => message('{"account":"6990","reason":"Övrigt","confidence":0.4}')),
    ).resolves.toEqual({ account: "6990", reason: "Övrigt", confidence: 0.4 });
  });
});
