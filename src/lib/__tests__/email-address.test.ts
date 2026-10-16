import { describe, expect, it } from "vitest";
import { isAddressedToOwner, normalizeAddress } from "@/lib/email-address";

describe("normalizeAddress", () => {
  it("compares mailboxes: case, display names, Gmail dots and +tags", () => {
    expect(normalizeAddress("Anna <Anna.Svensson+kvitton@Gmail.com>")).toBe("annasvensson@gmail.com");
    expect(normalizeAddress("anna.svensson@googlemail.com")).toBe("annasvensson@gmail.com");
    expect(normalizeAddress("Erik.Lund@Acme.se")).toBe("erik.lund@acme.se");
  });

  it("keeps +tags outside Gmail, so every forwarding alias stays distinct", () => {
    expect(normalizeAddress("receipts+abc123@in.unreceipt.com")).toBe("receipts+abc123@in.unreceipt.com");
    expect(normalizeAddress("receipts+abc123@in.unreceipt.com")).not.toBe(
      normalizeAddress("receipts+zzz999@in.unreceipt.com"),
    );
  });

  it("rejects things that aren't addresses", () => {
    expect(normalizeAddress("not an address")).toBeNull();
    expect(normalizeAddress("<script>@x")).toBeNull();
  });
});

describe("isAddressedToOwner", () => {
  const owner = ["anna@gmail.com", "receipts+abc123@in.unreceipt.com", "anna@acme.se"];

  it("accepts a receipt sent to one of the user's addresses", () => {
    expect(isAddressedToOwner(["Anna <a.n.n.a@gmail.com>"], owner)).toBe(true);
    expect(isAddressedToOwner(["boss@acme.se", "anna@acme.se"], owner)).toBe(true);
    expect(isAddressedToOwner(["receipts+abc123@in.unreceipt.com"], owner)).toBe(true);
  });

  it("refuses someone else's receipt resent to this user", () => {
    expect(isAddressedToOwner(["bjorn@gmail.com"], owner)).toBe(false);
    expect(isAddressedToOwner(["receipts+zzz999@in.unreceipt.com"], owner)).toBe(false);
    expect(isAddressedToOwner([], owner)).toBe(false);
  });
});
