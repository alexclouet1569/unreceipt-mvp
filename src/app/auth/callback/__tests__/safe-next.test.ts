import { describe, expect, it } from "vitest";
import { loginPath, safeNext } from "../safe-next";

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

describe("loginPath", () => {
  it("opens Create account and keeps the invite, query included", () => {
    const path = loginPath("/app/accountant/accept?token=abc_123-x", { signup: true });
    const url = new URL(path, "https://app.unreceipt.com");
    expect(url.pathname).toBe("/app/login");
    expect(url.searchParams.get("mode")).toBe("signup");
    expect(url.searchParams.get("next")).toBe("/app/accountant/accept?token=abc_123-x");
    // What the login page reads back passes the same check.
    expect(safeNext(url.searchParams.get("next"))).toBe("/app/accountant/accept?token=abc_123-x");
  });

  it("opens Sign in without the flag", () => {
    expect(loginPath("/app/firm-join")).toBe("/app/login?next=%2Fapp%2Ffirm-join");
  });

  it("never carries an unsafe next", () => {
    expect(loginPath("//evil.com", { signup: true })).toBe("/app/login?mode=signup&next=%2Fapp");
  });
});
