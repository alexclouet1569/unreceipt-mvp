// @vitest-environment node

import { describe, expect, it } from "vitest";
import { summarizeAiUsage, usageCostUsd, usageRowFrom } from "../ai-usage";

describe("AI usage", () => {
  it("costs a call from its tokens at the model's prices", () => {
    // Sonnet 5.5: 2,500 in × $2/M + 700 out × $10/M + 1,500 cached × $0.10/M.
    const row = usageRowFrom("claude-sonnet-5-5", {
      input_tokens: 2500,
      output_tokens: 700,
      cache_read_input_tokens: 1500,
      cache_creation_input_tokens: 0,
    } as never);
    expect(usageCostUsd(row)).toBeCloseTo(0.005 + 0.007 + 0.00015, 6);
  });

  it("charges cache writes at 1.25× input and knows the cheaper models", () => {
    const write = usageRowFrom("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 } as never);
    expect(usageCostUsd(write)).toBeCloseTo(0.125, 6);
  });

  it("keeps counts only, and never negative or fractional", () => {
    const row = usageRowFrom("claude-sonnet-5-5", { input_tokens: -3, output_tokens: 12.6 } as never);
    expect(row).toEqual({ model: "claude-sonnet-5-5", input_tokens: 0, output_tokens: 13, cache_read_tokens: 0, cache_write_tokens: 0 });
  });

  it("sums the month by area, most expensive first", () => {
    const s = summarizeAiUsage([
      { area: "email_text", ...usageRowFrom("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 0 } as never) },
      { area: "capture_scan", ...usageRowFrom("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 1000 } as never) },
      { area: "capture_scan", ...usageRowFrom("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 1000 } as never) },
    ]);
    expect(s.calls).toBe(3);
    expect(s.costUsd).toBeCloseTo(0.022, 6);
    expect(s.byArea.map((a) => [a.area, a.calls])).toEqual([
      ["capture_scan", 2],
      ["email_text", 1],
    ]);
  });
});

describe("AI usage from the database's monthly sums", () => {
  it("adds the groups up and reads the numbers Postgres sends as strings", async () => {
    const { summarizeGroups } = await import("../ai-usage");
    const s = summarizeGroups([
      { area: "capture_scan", model: "claude-sonnet-5-5", calls: "1200", input_tokens: "0", output_tokens: "1000000", cache_read_tokens: 0, cache_write_tokens: 0 },
      { area: "email_text", model: "claude-sonnet-5-5", calls: 3, input_tokens: 1_000_000, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
    ]);
    expect(s.calls).toBe(1203);
    expect(s.costUsd).toBeCloseTo(12, 6);
    expect(s.byArea[0]).toMatchObject({ area: "capture_scan", calls: 1200 });
  });
});
