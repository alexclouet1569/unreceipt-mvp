import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteAppUrl, appUrl } from "@/lib/app-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("absoluteAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.unreceipt.com/");
    expect(absoluteAppUrl("/app/settings")).toBe("https://staging.unreceipt.com/app/settings");
  });

  it("falls back to the production host when unset, where appUrl stays relative", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(appUrl("/app/settings")).toBe("/app/settings");
    expect(absoluteAppUrl("/app/settings")).toBe("https://app.unreceipt.com/app/settings");
  });

  it("ignores a value that isn't an http(s) origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "app.unreceipt.com");
    expect(absoluteAppUrl("/firm")).toBe("https://app.unreceipt.com/firm");
  });
});
