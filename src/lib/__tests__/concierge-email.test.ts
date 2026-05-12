import { describe, expect, it } from "vitest";
import { conciergePrefix, getConciergeEmail } from "../concierge-email";

describe("conciergePrefix", () => {
  it("returns 4 lowercase alphanumeric chars", () => {
    const p = conciergePrefix("00000000-0000-0000-0000-000000000001");
    expect(p).toMatch(/^[a-z0-9]{4}$/);
  });
  it("is deterministic", () => {
    const a = conciergePrefix("00000000-0000-0000-0000-0000000000ab");
    const b = conciergePrefix("00000000-0000-0000-0000-0000000000ab");
    expect(a).toBe(b);
  });
  it("differs for different userIds", () => {
    const a = conciergePrefix("00000000-0000-0000-0000-000000000001");
    const b = conciergePrefix("00000000-0000-0000-0000-000000000002");
    expect(a).not.toBe(b);
  });
});

describe("getConciergeEmail", () => {
  it("returns u-XXXX@unreceipt.com", () => {
    const email = getConciergeEmail("00000000-0000-0000-0000-000000000001");
    expect(email).toMatch(/^u-[a-z0-9]{4}@unreceipt\.com$/);
  });
});
