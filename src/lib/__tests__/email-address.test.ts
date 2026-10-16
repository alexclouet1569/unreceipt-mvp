import { describe, expect, it } from "vitest";
import {
  normalizeAddress,
  parseAddressList,
  rawHeaderValues,
  recipientOwnership,
} from "@/lib/email-address";

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

  it("takes the final <…>, never one hidden in the display name", () => {
    expect(normalizeAddress('"<anna@gmail.com>" <bjorn@gmail.com>')).toBe("bjorn@gmail.com");
  });

  it("rejects things that aren't addresses", () => {
    expect(normalizeAddress("not an address")).toBeNull();
    expect(normalizeAddress("<script>@x")).toBeNull();
  });
});

describe("parseAddressList", () => {
  it("honours backslash escapes and refuses anything unbalanced", () => {
    expect(parseAddressList('"foo\\" <receipts+abc123@in.unreceipt.com>, bar" <bjorn@gmail.com>')).toEqual([
      "bjorn@gmail.com",
    ]);
    expect(parseAddressList("(x\\) <receipts+abc123@in.unreceipt.com>, y) bjorn@gmail.com")).toEqual([
      "bjorn@gmail.com",
    ]);
    expect(parseAddressList('"unclosed <anna@gmail.com>')).toEqual([]);
  });

  it("splits at commas outside quotes and ignores display names and comments", () => {
    expect(
      parseAddressList('"Lund, Erik" <erik@acme.se>, anna@gmail.com (work), "receipts+x@in.unreceipt.com" <eve@evil.io>'),
    ).toEqual(["erik@acme.se", "anna@gmail.com", "eve@evil.io"]);
  });
});

describe("rawHeaderValues", () => {
  it("counts 'To :' (space before the colon) as To, like DKIM does", () => {
    const eml = "To: receipts+abc123@in.unreceipt.com\r\nFrom: noreply@uber.com\r\nTo : bjorn@gmail.com\r\n\r\nbody";
    expect(rawHeaderValues(eml, "to")).toHaveLength(2);
  });

  it("refuses a header block it can't read to the end", () => {
    const eml = "To: receipts+abc123@in.unreceipt.com\r\n" + "X-Pad: y\r\n".repeat(30_000) + "To: bjorn@gmail.com\r\n\r\nbody";
    expect(rawHeaderValues(eml, "to")).toBeNull();
    expect(rawHeaderValues("To: a@b.se\r\nno blank line", "to")).toBeNull();
  });

  it("reads every To: in the header block only, joining folded lines", () => {
    const eml = "From: noreply@uber.com\r\nTo: Anna\r\n <anna@gmail.com>\r\nTO: bjorn@gmail.com\r\nSubject: x\r\n\r\nTo: body@not.header";
    expect(rawHeaderValues(eml, "to")).toEqual(["Anna <anna@gmail.com>", "bjorn@gmail.com"]);
  });
});

describe("recipientOwnership", () => {
  const owner = { personal: ["anna@gmail.com", "anna@acme.se"], alias: "receipts+abc123@in.unreceipt.com" };

  it("recognises a receipt sent to one of the user's inboxes", () => {
    expect(recipientOwnership(["Anna <a.n.n.a@gmail.com>"], owner)).toBe("personal");
    expect(recipientOwnership(["boss@acme.se, anna@acme.se"], owner)).toBe("personal");
  });

  it("tells a receipt sent straight to the alias apart", () => {
    expect(recipientOwnership(["receipts+abc123@in.unreceipt.com"], owner)).toBe("alias");
  });

  it("refuses when the header block couldn't be read", () => {
    expect(recipientOwnership(null, owner)).toBe("none");
  });

  it("refuses someone else's receipt, a second To: header, and display-name tricks", () => {
    expect(recipientOwnership(["bjorn@gmail.com"], owner)).toBe("none");
    expect(recipientOwnership(["receipts+zzz999@in.unreceipt.com"], owner)).toBe("none");
    expect(recipientOwnership(["receipts+abc123@in.unreceipt.com", "bjorn@gmail.com"], owner)).toBe("none");
    expect(recipientOwnership([], owner)).toBe("none");
    expect(recipientOwnership(['"anna@gmail.com" <bjorn@gmail.com>'], owner)).toBe("none");
  });
});
