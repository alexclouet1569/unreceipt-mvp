import { describe, expect, it } from "vitest";
import { safeNext } from "../safe-next";

describe("safeNext", () => {
  it("keeps same-origin paths, query included", () => {
    expect(safeNext("/firm")).toBe("/firm");
    expect(safeNext("/app/accountant/accept?token=abc_123-x")).toBe("/app/accountant/accept?token=abc_123-x");
  });

  it("falls back to /app for anything that could leave the origin", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "//evil.com",
      "//evil.com/app",
      "https://evil.com",
      "http:/evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "evil.com",
      "/app@evil.com",
      "javascript:alert(1)",
      "/app\n",
      `/${"a".repeat(2000)}`,
    ]) {
      expect(safeNext(bad)).toBe("/app");
    }
  });
});
