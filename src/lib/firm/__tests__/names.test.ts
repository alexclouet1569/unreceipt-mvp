import { describe, expect, it } from "vitest";
import { isAcceptableDisplayName } from "@/lib/firm/names";

describe("isAcceptableDisplayName", () => {
  it("accepts ordinary company names", () => {
    for (const n of ["Bergström Redovisning AB", "Byrå & Co", "Ekonomihuset i Lund HB"]) {
      expect(isAcceptableDisplayName(n)).toBe(true);
    }
  });
  it("refuses links, addresses, authority and UnReceipt names", () => {
    for (const n of ["x", "https://evil.example", "www.byra.se", "byra.se", "info@byra.se", "Skatteverket", "UnReceipt Support", "Kronofogden AB"]) {
      expect(isAcceptableDisplayName(n)).toBe(false);
    }
  });
});
