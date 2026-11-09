import { describe, expect, it } from "vitest";
import { decodeStatement } from "../decode";

describe("decodeStatement", () => {
  it("reads UTF-8", () => {
    expect(decodeStatement(new TextEncoder().encode("Bokföringsdag;Belopp"))).toBe("Bokföringsdag;Belopp");
  });

  it("falls back to Windows-1252 for files that aren't valid UTF-8", () => {
    // "Bokföringsdag" with ö as the single byte 0xF6.
    const bytes = Uint8Array.from([0x42, 0x6f, 0x6b, 0x66, 0xf6, 0x72, 0x69, 0x6e, 0x67, 0x73, 0x64, 0x61, 0x67]);
    expect(decodeStatement(bytes)).toBe("Bokföringsdag");
  });
});
