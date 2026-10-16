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
        dmarc: "pass",
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
        dmarc: "pass",
        from: "forwarding-noreply@google.com",
        subject: "Bekräftelse av vidarebefordran i Gmail",
        text: "anna.svensson@gmail.com har begärt …\nBekräftelsekod: 593872831\n",
      }),
    ).toEqual({ provider: "gmail", code: "593872831", forAddress: "anna.svensson@gmail.com" });
  });

  it("still recognises the email when no code can be read", () => {
    expect(
      parseForwardingConfirmation({
        dmarc: "pass",
        from: "forwarding-noreply@google.com",
        subject: "Gmail Forwarding Confirmation",
        text: null,
      }),
    ).toEqual({ provider: "gmail", code: null, forAddress: null });
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

describe("Google DKIM check", () => {
  const confirmation = (authenticationResults: string | string[] | null) =>
    parseForwardingConfirmation({
      from: "forwarding-noreply@google.com",
      subject: "(#593872831) Gmail Forwarding Confirmation",
      text: "",
      authenticationResults,
    });

  it("accepts a Google-signed email", async () => {
    const { googleDkimVerdict } = await import("@/lib/forwarding-confirmation");
    const header =
      "amazonses.com; spf=pass smtp.mailfrom=google.com; dkim=pass header.d=google.com header.s=20230601; dmarc=pass";
    expect(googleDkimVerdict(header)).toBe("pass");
    expect(confirmation(header)?.code).toBe("593872831");
  });

  it("treats a forged Gmail sender as an ordinary email", () => {
    expect(confirmation("mx.example; spf=fail; dkim=none; dmarc=fail")).toBeNull();
    expect(confirmation("mx.example; dkim=pass header.d=google.com.evil.io")).toBeNull();
  });

  it("only trusts the topmost header, which the receiving server added", () => {
    expect(
      confirmation(["mx.example; dkim=fail", "forged; dkim=pass header.d=google.com"]),
    ).toBeNull();
  });

  it("refuses when there's no verdict at all (it then lands in Review needed)", () => {
    expect(confirmation(null)).toBeNull();
  });

  it("prefers Resend's DMARC verdict over any header", () => {
    const base = { from: "forwarding-noreply@google.com", subject: "(#593872831) Gmail Forwarding Confirmation", text: "" };
    expect(parseForwardingConfirmation({ ...base, dmarc: "pass" })?.code).toBe("593872831");
    expect(
      parseForwardingConfirmation({ ...base, dmarc: "fail", authenticationResults: "x; dkim=pass header.d=google.com" }),
    ).toBeNull();
  });

  it("prefers the labelled code over another number, and skips our alias", () => {
    const result = parseForwardingConfirmation({
      dmarc: "pass",
      from: "forwarding-noreply@google.com",
      subject: "Gmail Forwarding Confirmation",
      text: "receipts+abc@in.unreceipt.com\nTel: 0812345678\nanna@gmail.com har begärt …\nBekräftelsekod: 593872831",
    });
    expect(result).toEqual({ provider: "gmail", code: "593872831", forAddress: "anna@gmail.com" });
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
