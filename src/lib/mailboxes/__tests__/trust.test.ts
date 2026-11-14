// @vitest-environment node
// The DMARC and recipient checks for mail read from a connected mailbox,
// with spoof attempts. No mailbox message is DMARC-trusted today (the
// owner can IMAP-APPEND or messages.insert a message with a self-written
// top header), so mailboxTrust() gives dmarc null; the header parser is
// still tested through receivingDmarcVerdict() for the day DKIM/ARC is
// verified.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/receipts/llm-extract", () => ({
  llmExtract: vi.fn(async () => null),
  _resetLlmExtractClientForTests: () => {},
}));

import { parseReceipt } from "@/lib/receipts/parser";
import {
  GMAIL_AUTHSERV_ID,
  RECEIVING_AUTHSERV_IDS,
  mailboxTrust,
  parseAuthenticationResults,
  receivingDmarcVerdict,
} from "../trust";

const GMAIL_AR = [
  "Authentication-Results: mx.google.com;",
  "       dkim=pass header.i=@uber.com header.s=s1 header.b=AbC123;",
  "       spf=pass (google.com: domain of bounce@uber.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@uber.com;",
  "       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=uber.com",
];

// A message as Gmail's format=raw returns it: Google's own headers on top.
function message({
  ar = GMAIL_AR,
  below = [] as string[],
  from = ["From: Uber Receipts <noreply@uber.com>"],
  to = ["To: anna@gmail.com"],
  extra = [] as string[],
}: { ar?: string[]; below?: string[]; from?: string[]; to?: string[]; extra?: string[] } = {}): Buffer {
  return Buffer.from(
    [
      "Delivered-To: anna@gmail.com",
      "Received: by 2002:a05:6a10:1234 with SMTP id x1;",
      "        Wed, 12 Nov 2026 09:00:01 -0800 (PST)",
      "ARC-Authentication-Results: i=1; mx.google.com;",
      "       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=uber.com",
      "Return-Path: <bounce@uber.com>",
      "Received: from mail.uber.com (mail.uber.com. [1.2.3.4])",
      "        by mx.google.com with ESMTPS id y2;",
      ...ar,
      ...below,
      ...from,
      ...to,
      ...extra,
      "Subject: Your Wednesday trip with Uber",
      "Message-ID: <abc@uber.com>",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Total: 129,00 kr",
      "",
    ].join("\r\n"),
    "latin1",
  );
}

const trust = (raw: Buffer, provider: "google" | "microsoft" = "google", mailboxEmail = "anna@gmail.com") =>
  mailboxTrust({ rawEml: raw, provider, mailboxEmail });

// What the header parser would conclude if Gmail's header were trusted.
const verdict = (raw: Buffer) => receivingDmarcVerdict(raw.toString("latin1"), [GMAIL_AUTHSERV_ID]);

describe("parseAuthenticationResults", () => {
  it("reads the authserv-id and each result, ignoring comments", () => {
    const parsed = parseAuthenticationResults(GMAIL_AR.join(" ").replace(/^Authentication-Results:\s*/, ""));
    expect(parsed?.authservId).toBe("mx.google.com");
    expect(parsed?.results.map((r) => [r.method, r.result])).toEqual([
      ["dkim", "pass"],
      ["spf", "pass"],
      ["dmarc", "pass"],
    ]);
    expect(parsed?.results[2].props["header.from"]).toBe("uber.com");
  });

  it("refuses unbalanced comments and a missing authserv-id", () => {
    expect(parseAuthenticationResults("mx.google.com; dmarc=pass (oops header.from=uber.com")).toBeNull();
    expect(parseAuthenticationResults("dmarc=pass header.from=uber.com")).toBeNull();
  });
});

describe("Gmail headers: the DMARC parser (kept for DKIM/ARC work) and the recipient", () => {
  it("reads Gmail's DMARC pass for the From: domain", () => {
    expect(verdict(message())).toBe("pass");
  });

  it("matches the connected address the way Gmail does (dots, +tags, case)", () => {
    expect(trust(message({ to: ["To: A.nna+receipts@Gmail.com"] })).recipient).toEqual({
      from: "given",
      ownership: "personal",
    });
  });

  it("passes on a fail verdict as is", () => {
    const ar = [...GMAIL_AR.slice(0, 3), "       dmarc=fail (p=REJECT sp=REJECT dis=QUARANTINE) header.from=uber.com"];
    expect(verdict(message({ ar }))).toBe("fail");
  });

  it("ignores a sender-written dmarc=pass below Gmail's verdict", () => {
    const ar = ["Authentication-Results: mx.google.com; dmarc=fail (p=NONE) header.from=uber.com"];
    const below = ["Authentication-Results: mx.google.com; dmarc=pass header.from=uber.com"];
    expect(verdict(message({ ar, below }))).toBe("fail");
    // …or written into the message's own header block further down.
    expect(verdict(message({ ar, extra: below }))).toBe("fail");
  });

  it("trusts nothing when the topmost header isn't Gmail's, even with Gmail's name lower down", () => {
    const ar = ["Authentication-Results: mx.example.net; dmarc=none header.from=uber.com"];
    const below = ["Authentication-Results: mx.google.com; dmarc=pass header.from=uber.com"];
    expect(verdict(message({ ar, below }))).toBeNull();
  });

  it("trusts nothing without any Authentication-Results (only ARC's)", () => {
    expect(verdict(message({ ar: [] }))).toBeNull();
  });

  it("refuses look-alike authserv-ids", () => {
    for (const id of ["mx.google.com.evil.net", "google.com", "mx.google.co", "evil-mx.google.com"]) {
      const ar = [`Authentication-Results: ${id}; dmarc=pass header.from=uber.com`];
      expect(verdict(message({ ar })), id).toBeNull();
    }
  });

  it("refuses a pass for another domain than the From: address", () => {
    const ar = ["Authentication-Results: mx.google.com; dmarc=pass header.from=evil.com"];
    expect(verdict(message({ ar }))).toBeNull();
    // A subdomain is another domain.
    const sub = ["Authentication-Results: mx.google.com; dmarc=pass header.from=mail.uber.com"];
    expect(verdict(message({ ar: sub }))).toBeNull();
    // The From: names uber.com only in its display name.
    expect(verdict(message({ from: ['From: "noreply@uber.com" <a@evil.com>'] }))).toBeNull();
  });

  it("refuses a dmarc=pass hidden in a comment or a second dmarc result", () => {
    const comment = ["Authentication-Results: mx.google.com; dmarc=fail (dmarc=pass; header.from=uber.com) header.from=uber.com"];
    expect(verdict(message({ ar: comment }))).toBe("fail");
    const twice = ["Authentication-Results: mx.google.com; dmarc=fail header.from=uber.com; dmarc=pass header.from=uber.com"];
    expect(verdict(message({ ar: twice }))).toBeNull();
  });

  it("refuses two From: headers or two From: addresses", () => {
    expect(verdict(message({ from: ["From: noreply@uber.com", "From: a@evil.com"] }))).toBeNull();
    expect(verdict(message({ from: ["From: noreply@uber.com, a@evil.com"] }))).toBeNull();
  });

  it("refuses a header block with mixed line endings", () => {
    const raw = Buffer.concat([message().subarray(0, 40), Buffer.from("X-Injected: 1\n"), message().subarray(40)]);
    expect(verdict(raw)).toBeNull();
  });

  it("counts the recipient only from one To: naming the connected address", () => {
    expect(trust(message({ to: ["To: someone@else.com"] })).recipient).toEqual({ from: "given", ownership: "none" });
    expect(trust(message({ to: ["To: anna@gmail.com", "To: someone@else.com"] })).recipient).toEqual({
      from: "given",
      ownership: "none",
    });
    expect(trust(message({ to: ["Cc: anna@gmail.com"] })).recipient).toEqual({ from: "given", ownership: "none" });
    // A display name naming the address doesn't count.
    expect(trust(message({ to: ['To: "anna@gmail.com" <x@evil.com>'] })).recipient).toEqual({
      from: "given",
      ownership: "none",
    });
  });
});

describe("mailboxTrust (Gmail): never DMARC-trusted", () => {
  // The owner IMAP-APPENDs (or messages.insert-s) a made-up Uber receipt
  // into their own inbox, with Gmail's header written on top by hand. Gmail
  // stores the bytes as given; history reports it as messageAdded in INBOX.
  const appended = () =>
    Buffer.from(
      [
        "Authentication-Results: mx.google.com;",
        "       dkim=pass header.i=@uber.com header.s=s1 header.b=Fake;",
        "       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=uber.com",
        "From: Uber Receipts <noreply@uber.com>",
        "To: anna@gmail.com",
        "Subject: Your Wednesday trip with Uber",
        "Message-ID: <forged-1@uber.com>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Total 4999 SEK",
        "12 November 2026",
      ].join("\r\n"),
      "latin1",
    );

  it("trusts no provider's header today", () => {
    expect(RECEIVING_AUTHSERV_IDS).toEqual({ google: null, microsoft: null });
  });

  it("gives dmarc null for a spoofed topmost mx.google.com dmarc=pass", () => {
    // The parser alone would believe it: that is exactly the problem.
    expect(verdict(appended())).toBe("pass");
    expect(trust(appended())).toEqual({ dmarc: null, recipient: { from: "given", ownership: "personal" } });
  });

  it("gives dmarc null even for a message as Gmail really delivers it", () => {
    expect(trust(message()).dmarc).toBeNull();
  });

  it("leaves a full Uber template hit from a mailbox in Review needed", async () => {
    const raw = appended();
    // As ingestReceiptEmail derives the parser's inputs from a TrustInput.
    const parse = (t: ReturnType<typeof trust>) =>
      parseReceipt({
        kind: "email",
        raw: {
          from: "noreply@uber.com",
          to: "anna@gmail.com",
          subject: "Your Wednesday trip with Uber",
          text: raw.toString("latin1").split("\r\n\r\n")[1],
          html: null,
          authenticated: t.dmarc === "pass",
          recipient: t.dmarc === "pass" && t.recipient.from === "given" ? t.recipient.ownership : "none",
        },
      });
    const result = await parse(trust(raw));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fields.merchant_name).toBe("Uber");
    // Below the 0.75 floor: pending_review, not verified.
    expect(result.fields.parse_confidence).toBeLessThan(0.75);
    // Had the forged header been believed, it would have been verified.
    const believed = await parse({ dmarc: "pass", recipient: { from: "given", ownership: "personal" } });
    expect(believed.status === "ok" && believed.fields.parse_confidence).toBeGreaterThanOrEqual(0.75);
  });
});

describe("mailboxTrust (Outlook)", () => {
  it("never trusts a DMARC verdict yet (Exchange writes no authserv-id)", () => {
    const ar = ["Authentication-Results: spf=pass (sender IP is 1.2.3.4) smtp.mailfrom=uber.com; dkim=pass (signature was verified) header.d=uber.com;dmarc=pass action=none header.from=uber.com;compauth=pass reason=100"];
    expect(trust(message({ ar }), "microsoft").dmarc).toBeNull();
    expect(trust(message(), "microsoft").dmarc).toBeNull();
    expect(trust(message(), "microsoft").recipient).toEqual({ from: "given", ownership: "personal" });
  });
});

describe("receivingDmarcVerdict", () => {
  it("only reads the provider ids it is given", () => {
    const text = message().toString("latin1");
    expect(receivingDmarcVerdict(text, [GMAIL_AUTHSERV_ID])).toBe("pass");
    expect(receivingDmarcVerdict(text, ["outlook.com"])).toBeNull();
  });
});
