// @vitest-environment node
// The DMARC and recipient checks for mail read from a connected mailbox,
// with spoof attempts: a sender can write any header below the ones the
// receiving provider adds on top.

import { describe, expect, it } from "vitest";
import { mailboxTrust, parseAuthenticationResults, receivingDmarcVerdict } from "../trust";

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

describe("mailboxTrust (Gmail)", () => {
  it("trusts Gmail's own DMARC pass for the From: domain, sent to the connected address", () => {
    expect(trust(message())).toEqual({ dmarc: "pass", recipient: { from: "given", ownership: "personal" } });
  });

  it("matches the connected address the way Gmail does (dots, +tags, case)", () => {
    expect(trust(message({ to: ["To: A.nna+receipts@Gmail.com"] })).recipient).toEqual({
      from: "given",
      ownership: "personal",
    });
  });

  it("passes on a fail verdict as is", () => {
    const ar = [...GMAIL_AR.slice(0, 3), "       dmarc=fail (p=REJECT sp=REJECT dis=QUARANTINE) header.from=uber.com"];
    expect(trust(message({ ar })).dmarc).toBe("fail");
  });

  it("ignores a sender-written dmarc=pass below Gmail's verdict", () => {
    const ar = ["Authentication-Results: mx.google.com; dmarc=fail (p=NONE) header.from=uber.com"];
    const below = ["Authentication-Results: mx.google.com; dmarc=pass header.from=uber.com"];
    expect(trust(message({ ar, below })).dmarc).toBe("fail");
    // …or written into the message's own header block further down.
    expect(trust(message({ ar, extra: below })).dmarc).toBe("fail");
  });

  it("trusts nothing when the topmost header isn't Gmail's, even with Gmail's name lower down", () => {
    const ar = ["Authentication-Results: mx.example.net; dmarc=none header.from=uber.com"];
    const below = ["Authentication-Results: mx.google.com; dmarc=pass header.from=uber.com"];
    expect(trust(message({ ar, below })).dmarc).toBeNull();
  });

  it("trusts nothing without any Authentication-Results (only ARC's)", () => {
    expect(trust(message({ ar: [] })).dmarc).toBeNull();
  });

  it("refuses look-alike authserv-ids", () => {
    for (const id of ["mx.google.com.evil.net", "google.com", "mx.google.co", "evil-mx.google.com"]) {
      const ar = [`Authentication-Results: ${id}; dmarc=pass header.from=uber.com`];
      expect(trust(message({ ar })).dmarc, id).toBeNull();
    }
  });

  it("refuses a pass for another domain than the From: address", () => {
    const ar = ["Authentication-Results: mx.google.com; dmarc=pass header.from=evil.com"];
    expect(trust(message({ ar })).dmarc).toBeNull();
    // A subdomain is another domain.
    const sub = ["Authentication-Results: mx.google.com; dmarc=pass header.from=mail.uber.com"];
    expect(trust(message({ ar: sub })).dmarc).toBeNull();
    // The From: names uber.com only in its display name.
    expect(trust(message({ from: ['From: "noreply@uber.com" <a@evil.com>'] })).dmarc).toBeNull();
  });

  it("refuses a dmarc=pass hidden in a comment or a second dmarc result", () => {
    const comment = ["Authentication-Results: mx.google.com; dmarc=fail (dmarc=pass; header.from=uber.com) header.from=uber.com"];
    expect(trust(message({ ar: comment })).dmarc).toBe("fail");
    const twice = ["Authentication-Results: mx.google.com; dmarc=fail header.from=uber.com; dmarc=pass header.from=uber.com"];
    expect(trust(message({ ar: twice })).dmarc).toBeNull();
  });

  it("refuses two From: headers or two From: addresses", () => {
    expect(trust(message({ from: ["From: noreply@uber.com", "From: a@evil.com"] })).dmarc).toBeNull();
    expect(trust(message({ from: ["From: noreply@uber.com, a@evil.com"] })).dmarc).toBeNull();
  });

  it("refuses a header block with mixed line endings", () => {
    const raw = Buffer.concat([message().subarray(0, 40), Buffer.from("X-Injected: 1\n"), message().subarray(40)]);
    expect(trust(raw).dmarc).toBeNull();
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
    expect(receivingDmarcVerdict(text, ["mx.google.com"])).toBe("pass");
    expect(receivingDmarcVerdict(text, ["outlook.com"])).toBeNull();
  });
});
