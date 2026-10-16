import { describe, expect, it } from "vitest";
import { parseForwardingConfirmation } from "@/lib/forwarding-confirmation";

const BODY = `anna.svensson@gmail.com has requested to automatically forward mail to your email
address receipts+abc12345mn@in.unreceipt.com.
Confirmation code: 593872831

To allow anna.svensson@gmail.com to automatically forward mail to your address,
please click the link below to confirm the request:

https://mail-settings.google.com/mail/vf-abcdef
`;

describe("parseForwardingConfirmation", () => {
  it("reads the code and the Gmail account from Gmail's confirmation email", () => {
    expect(
      parseForwardingConfirmation({
        from: "Gmail Team <forwarding-noreply@google.com>",
        subject:
          "(#593872831) Gmail Forwarding Confirmation - Receive Mail from anna.svensson@gmail.com",
        text: BODY,
      }),
    ).toEqual({ provider: "gmail", code: "593872831", forAddress: "anna.svensson@gmail.com" });
  });

  it("falls back to the body when the subject is localised and has no code", () => {
    expect(
      parseForwardingConfirmation({
        from: "forwarding-noreply@google.com",
        subject: "Bekräftelse av vidarebefordran i Gmail",
        text: "anna.svensson@gmail.com har begärt …\nBekräftelsekod: 593872831\n",
      }),
    ).toEqual({ provider: "gmail", code: "593872831", forAddress: "anna.svensson@gmail.com" });
  });

  it("still recognises the email when no code can be read", () => {
    expect(
      parseForwardingConfirmation({
        from: "forwarding-noreply@google.com",
        subject: "Gmail Forwarding Confirmation",
        text: null,
      }),
    ).toEqual({ provider: "gmail", code: null, forAddress: null });
  });

  it("ignores every other sender", () => {
    expect(
      parseForwardingConfirmation({
        from: "receipts@uber.com",
        subject: "(#593872831) Gmail Forwarding Confirmation",
        text: BODY,
      }),
    ).toBeNull();
  });

  it("never returns our own alias as the Gmail account", () => {
    const result = parseForwardingConfirmation({
      from: "forwarding-noreply@google.com",
      subject: "Gmail Forwarding Confirmation",
      text: "receipts+abc12345mn@in.unreceipt.com\nConfirmation code: 593872831",
    });
    expect(result?.forAddress).toBeNull();
    expect(result?.code).toBe("593872831");
  });

  it("drops anything that isn't an email address", () => {
    const result = parseForwardingConfirmation({
      from: "forwarding-noreply@google.com",
      subject: "(#593872831) Gmail Forwarding Confirmation - Receive Mail from <script>",
      text: "",
    });
    expect(result?.forAddress).toBeNull();
  });
});

describe("gmailFilterQuery", () => {
  it("ORs the subject words and quotes phrases", async () => {
    const { gmailFilterQuery } = await import("@/lib/forwarding-filters");
    expect(gmailFilterQuery(["receipt", "order confirmation", "kvitto"])).toBe(
      'subject:(receipt OR "order confirmation" OR kvitto)',
    );
  });
});
