import { describe, expect, it } from "vitest";
import {
  getMerchantInitials,
  getMerchantColor,
} from "../merchant-display";

describe("getMerchantInitials", () => {
  it("returns the first two word initials", () => {
    expect(getMerchantInitials("ICA Kvantum")).toBe("IK");
    expect(getMerchantInitials("Spotify AB")).toBe("SA");
  });
  it("falls back to first two letters for one-word names", () => {
    expect(getMerchantInitials("Spotify")).toBe("SP");
    expect(getMerchantInitials("X")).toBe("X");
  });
  it("returns '?' for empty or null", () => {
    expect(getMerchantInitials("")).toBe("?");
    expect(getMerchantInitials(null)).toBe("?");
    expect(getMerchantInitials(undefined)).toBe("?");
  });
});

describe("getMerchantColor", () => {
  it("is deterministic for the same name", () => {
    expect(getMerchantColor("ICA")).toBe(getMerchantColor("ICA"));
    expect(getMerchantColor("ica")).toBe(getMerchantColor("ICA")); // case-insensitive
  });
  it("returns a hex color string", () => {
    expect(getMerchantColor("Spotify")).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
