import { describe, expect, it, vi } from "vitest";
import { isGmailConfirmUrl, parseForwardingConfirmation } from "@/lib/forwarding-confirmation";

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
        dmarc: "pass",
        from: "Gmail Team <forwarding-noreply@google.com>",
        subject:
          "(#593872831) Gmail Forwarding Confirmation - Receive Mail from anna.svensson@gmail.com",
        text: BODY,
      }),
    ).toEqual({ provider: "gmail", code: "593872831", forAddress: "anna.svensson@gmail.com", forAddressExact: true, confirmUrl: null });
  });

  it("reads Gmail's current format: no code at all, only the confirmation link (seen 2026-11-13)", () => {
    const link =
      "https://mail-settings.google.com/mail/vf-%5BANGjdJ_kwASwe7-Afyltugz7xoTg2zHh01jGFOwVrcTRi2M7VXERIxMltoNUAp%5D-RIOIPKF9aEQteQQn2f2v9NVe28U";
    const text = `anna.svensson@gmail.com has requested to automatically forward mail
to your email
address receipts+abc12345mn@in.unreceipt.com.

To allow anna.svensson@gmail.com to automatically forward mail to
your address,
please click the link below to confirm the request:

${link}

If you click the link and it appears to be broken, please copy and paste it
into a new browser window.
click this link to cancel this
verification:
https://mail-settings.google.com/mail/uf-%5BANGjdJ96q7s9mUqFVC_GY5p%5D-RIOIPKF9aEQteQQn2f2v9NVe28U
`;
    expect(
      parseForwardingConfirmation({
        dmarc: "pass",
        from: "forwarding-noreply@google.com",
        // The subject Gmail sent, character for character (no "#code").
        subject: "(Gmail Forwarding confirmation \u2013 Receive mail from anna.svensson@gmail.com",
        text,
      }),
    ).toEqual({ provider: "gmail", code: null, forAddress: "anna.svensson@gmail.com", forAddressExact: true, confirmUrl: link });
  });

  it("falls back to the body when the subject is localised and has no code", () => {
    expect(
      parseForwardingConfirmation({
        dmarc: "pass",
        from: "forwarding-noreply@google.com",
        subject: "Bekräftelse av vidarebefordran i Gmail",
        text: "anna.svensson@gmail.com har begärt …\nBekräftelsekod: 593872831\n",
      }),
    ).toEqual({ provider: "gmail", code: "593872831", forAddress: "anna.svensson@gmail.com", forAddressExact: false, confirmUrl: null });
  });

  it("still recognises the email when no code can be read", () => {
    expect(
      parseForwardingConfirmation({
        dmarc: "pass",
        from: "forwarding-noreply@google.com",
        subject: "Gmail Forwarding Confirmation",
        text: null,
      }),
    ).toEqual({ provider: "gmail", code: null, forAddress: null, forAddressExact: false, confirmUrl: null });
  });

  it("ignores every other sender", () => {
    expect(
      parseForwardingConfirmation({
        dmarc: "pass",
        from: "receipts@uber.com",
        subject: "(#593872831) Gmail Forwarding Confirmation",
        text: BODY,
      }),
    ).toBeNull();
  });

  it("never returns our own alias as the Gmail account", () => {
    const result = parseForwardingConfirmation({
      dmarc: "pass",
      from: "forwarding-noreply@google.com",
      subject: "Gmail Forwarding Confirmation",
      text: "receipts+abc12345mn@in.unreceipt.com\nConfirmation code: 593872831",
    });
    expect(result?.forAddress).toBeNull();
    expect(result?.code).toBe("593872831");
  });

  it("drops anything that isn't an email address", () => {
    const result = parseForwardingConfirmation({
      dmarc: "pass",
      from: "forwarding-noreply@google.com",
      subject: "(#593872831) Gmail Forwarding Confirmation - Receive Mail from <script>",
      text: "",
    });
    expect(result?.forAddress).toBeNull();
  });
});

describe("forwarding filter words", () => {
  it("quotes hyphenated terms for Gmail so '-' isn't read as 'exclude'", async () => {
    const { gmailFilterQuery } = await import("@/lib/forwarding-filters");
    expect(gmailFilterQuery(["e-billet", "kvitto"])).toBe('subject:("e-billet" OR kvitto)');
  });

  it("gives Outlook only the words no shorter word already covers", async () => {
    const { outlookSubjectWords } = await import("@/lib/forwarding-filters");
    expect(outlookSubjectWords(["kvitto", "kvitton", "bekräftelse", "orderbekräftelse", "commande", "commandé"])).toEqual([
      "kvitto",
      "bekräftelse",
      "commande",
      "commandé",
    ]);
  });

  it("keeps 'recu' out of Outlook, where it would match 'recurring'", async () => {
    const { outlookSubjectWords, gmailFilterQuery } = await import("@/lib/forwarding-filters");
    expect(outlookSubjectWords()).not.toContain("recu");
    expect(gmailFilterQuery()).toContain(" OR recu OR ");
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

describe("sender check", () => {
  const confirmation = (dmarc: string | null) =>
    parseForwardingConfirmation({
      from: "forwarding-noreply@google.com",
      subject: "(#593872831) Gmail Forwarding Confirmation",
      text: "",
      dmarc,
    });

  it("accepts Gmail's email when Resend's DMARC check passed", () => {
    expect(confirmation("pass")?.code).toBe("593872831");
  });

  it("treats a forged or unchecked Gmail sender as an ordinary email", () => {
    expect(confirmation("fail")).toBeNull();
    expect(confirmation("gray")).toBeNull();
    // No verdict at all: fail closed (it then lands in Review needed).
    expect(confirmation(null)).toBeNull();
  });

  it("prefers the labelled code over another number, and skips our alias", () => {
    const result = parseForwardingConfirmation({
      dmarc: "pass",
      from: "forwarding-noreply@google.com",
      subject: "Gmail Forwarding Confirmation",
      text: "receipts+abc@in.unreceipt.com\nTel: 0812345678\nanna@gmail.com har begärt …\nBekräftelsekod: 593872831",
    });
    expect(result).toEqual({ provider: "gmail", code: "593872831", forAddress: "anna@gmail.com", forAddressExact: false, confirmUrl: null });
  });

  it("stays fast on a hostile 60 KB subject", () => {
    const started = Date.now();
    parseForwardingConfirmation({
      dmarc: "pass",
      from: "forwarding-noreply@google.com",
      subject: "from " + "@".repeat(60_000),
      text: "@".repeat(60_000),
    });
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("Gmail auto-confirmation", () => {
  it("reads Gmail's confirmation link, and only that host", async () => {
    const { parseForwardingConfirmation } = await import("@/lib/forwarding-confirmation");
    const parsed = parseForwardingConfirmation({
      from: "forwarding-noreply@google.com",
      dmarc: "pass",
      subject: "(#593872831) Gmail Forwarding Confirmation - Receive Mail from anna@gmail.com",
      text: "Click https://evil.example/mail/vf-aaaaaaaaaaaa or https://mail-settings.google.com/mail/vf-%5BAB%5D-tokentokentoken now",
    });
    expect(parsed?.confirmUrl).toBe("https://mail-settings.google.com/mail/vf-%5BAB%5D-tokentokentoken");
  });

  it("posts only to Gmail's own confirmation path", async () => {
    const { gmailConfirmEndpoint, isOwnInbox } = await import("@/lib/forwarding-autoconfirm");
    expect(gmailConfirmEndpoint("https://mail-settings.google.com/mail/vf-%5BAB%5D-tokentokentoken")).toBe(
      "https://mail.google.com/mail/vf-%5BAB%5D-tokentokentoken",
    );
    expect(gmailConfirmEndpoint("https://mail-settings.google.com.evil.com/mail/vf-tokentokentoken")).toBeNull();
    expect(gmailConfirmEndpoint("https://mail-settings.google.com/mail/vf-token/../../x")).toBeNull();
    expect(gmailConfirmEndpoint("http://mail-settings.google.com/mail/vf-tokentokentoken")).toBeNull();
    expect(isOwnInbox("Anna@Gmail.com", ["anna@gmail.com"])).toBe(true);
    expect(isOwnInbox("anna@gmail.com", ["anna@acme.se"])).toBe(false);
    expect(isOwnInbox(null, ["anna@gmail.com"])).toBe(false);
  });
});

describe("Gmail auto-confirmation, hostile addresses", () => {
  it("never treats the start of a long crafted address as the requester", async () => {
    const { parseForwardingConfirmation } = await import("@/lib/forwarding-confirmation");
    const label = "0" + "a".repeat(62);
    const crafted = `anna@acme.se.${label}.${label}.${label}.evil.com`;
    const parsed = parseForwardingConfirmation({
      from: "forwarding-noreply@google.com",
      dmarc: "pass",
      subject: `(#593872831) Gmail Forwarding Confirmation - Receive Mail from ${crafted}`,
      text: `${crafted} has requested to automatically forward mail to your email address.`,
    });
    expect(parsed?.forAddressExact).toBe(false);
    expect(parsed?.forAddress).not.toBe("anna@acme.se");
  });

  it("matches the same Gmail mailbox written with dots or a +tag", async () => {
    const { isOwnInbox } = await import("@/lib/forwarding-autoconfirm");
    expect(isOwnInbox("anna.svensson@gmail.com", ["annasvensson@gmail.com"])).toBe(true);
    expect(isOwnInbox("anna.svensson+x@googlemail.com", ["annasvensson@gmail.com"])).toBe(true);
    expect(isOwnInbox("anna.svensson@acme.se", ["annasvensson@acme.se"])).toBe(false);
  });

  it("counts only a 2xx answer from Google as confirmed", async () => {
    const { confirmGmailForwarding } = await import("@/lib/forwarding-autoconfirm");
    const link = "https://mail-settings.google.com/mail/vf-%5BAB%5D-tokentokentoken";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce({ status: 302 });
    expect(await confirmGmailForwarding(link)).toBe(false);
    fetchMock.mockResolvedValueOnce({ status: 200 });
    expect(await confirmGmailForwarding(link)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("isGmailConfirmUrl", () => {
  it("accepts only Gmail's own confirmation page", () => {
    expect(isGmailConfirmUrl("https://mail-settings.google.com/mail/vf-%5BABCDEFGHIJK%5D-XYZ")).toBe(true);
    for (const bad of [
      "http://mail-settings.google.com/mail/vf-%5BABCDEFGHIJK%5D-XYZ",
      "https://mail-settings.google.com.evil.com/mail/vf-%5BABCDEFGHIJK%5D-XYZ",
      "https://evil.com/?https://mail-settings.google.com/mail/vf-%5BABCDEFGHIJK%5D",
      "https://mail-settings.google.com/mail/uf-%5BABCDEFGHIJK%5D-XYZ",
      "https://mail-settings.google.com/mail/vf-%5BABCDEFGHIJK%5D-XYZ?next=https://evil.com",
      "https://mail-settings.google.com/mail/vf-%5BABCDEFGHIJK%5D-XYZ#x",
      "javascript:alert(1)//https://mail-settings.google.com/mail/vf-%5BABCDEFGHIJK%5D",
      "https://mail-settings.google.com/mail/vf-short",
      null,
      42,
    ]) {
      expect(isGmailConfirmUrl(bad)).toBe(false);
    }
  });
});
