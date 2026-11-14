// @vitest-environment node

import { describe, expect, it } from "vitest";
import { decodeEntities, emailView, htmlToText, MAX_VIEW_CHARS, textView } from "../email-view";
import { MAX_BODY_CHARS } from "@/lib/mailboxes/raw-message";

const eml = (headers: string[], body: string) => Buffer.from([...headers, "", body].join("\r\n"), "utf8");

describe("htmlToText", () => {
  it("keeps the words and the layout's line breaks, drops every tag", () => {
    const html =
      '<html><head><title>T</title><style>.x{}</style></head><body>' +
      '<div style="color:#fff; display: none">Preview <div>nested</div> text</div><img style="display:none" src="x">' +
      '<table><tr><td>Coffee</td><td>45,00 kr</td></tr><tr><td>Total</td><td><b>45,00&nbsp;kr</b></td></tr></table>' +
      '<p>Thanks&nbsp;&amp; welcome back</p><img src="https://pixel.example/o.gif" alt="x">' +
      '<script>fetch("https://evil.example")</script><a href="https://x.example/track?id=1">View in browser</a></body></html>';
    const text = htmlToText(html);
    expect(text).toContain("Coffee 45,00 kr");
    expect(text).toContain("Total 45,00 kr");
    expect(text).toContain("Thanks & welcome back");
    expect(text).toContain("View in browser");
    expect(text).not.toMatch(/[<>]|pixel\.example|evil\.example|x\.example|\.x\{\}|Preview|nested/);
  });

  it("removes padding characters mail templates hide text with", () => {
    expect(htmlToText("<p>Hello͏ ‌​ world</p>")).toBe("Hello world");
  });

  it("stays fast on hostile HTML (unclosed tags, comments, script)", () => {
    const hostile =
      "<".repeat(200_000) +
      "<!--".repeat(50_000) +
      "<script>".repeat(50_000) +
      "<style".repeat(50_000) +
      '<div style="display:none">'.repeat(20_000) +
      `<a ${"b".repeat(100_000)}`;
    const started = Date.now();
    htmlToText(hostile);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("treats a never-closed <script> as running to the end", () => {
    expect(htmlToText("<p>Total 5</p><script>alert(1)")).toBe("Total 5");
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities, drops invalid code points", () => {
    expect(decodeEntities("&euro;5 &#8364; &#x20AC; &auml; &bogus; &#0; &#xD800;")).toBe("€5 € € ä &bogus;  ");
  });
});

describe("emailView", () => {
  it("reads the HTML part first (what the recipient saw), decodes encodings and headers", () => {
    const view = emailView(
      eml(
        [
          "From: =?UTF-8?Q?Caf=C3=A9_Ol=C3=A9?= <hej@cafe.example>",
          "To: receipts+abc@in.unreceipt.com",
          "Subject: =?UTF-8?B?S3ZpdHRvIGZyw6VuIENhZsOp?=",
          "Date: Fri, 9 May 2026 23:48:00 +0200",
          'Content-Type: multipart/alternative; boundary="b"',
        ],
        [
          "--b",
          "Content-Type: text/plain; charset=utf-8",
          "",
          "Thanks for your visit, total 45,00 kr. (the text version leaves out the VAT)",
          "--b",
          "Content-Type: text/html; charset=utf-8",
          "Content-Transfer-Encoding: quoted-printable",
          "",
          "<p>Kaffe 45,00 kr</p><p>Moms 12 % 4,82 kr, tack f=C3=B6r bes=C3=B6ket!</p>",
          "--b--",
        ].join("\r\n"),
      ),
    );
    expect(view.from).toBe("Café Olé <hej@cafe.example>");
    expect(view.to).toBe("receipts+abc@in.unreceipt.com");
    expect(view.subject).toBe("Kvitto från Café");
    // As written: converting it could show another day.
    expect(view.date).toBe("Fri, 9 May 2026 23:48:00 +0200");
    expect(view.text).toBe("Kaffe 45,00 kr\n\nMoms 12 % 4,82 kr, tack för besöket!");
    expect(view.truncated).toBe(false);
  });

  it("reads the text part when the HTML has (almost) no words", () => {
    const view = emailView(
      eml(
        ['Content-Type: multipart/alternative; boundary="b"'],
        [
          "--b",
          "Content-Type: text/plain",
          "Content-Transfer-Encoding: base64",
          "",
          Buffer.from("Trip fare 194,00 kr\nThanks for riding").toString("base64"),
          "--b",
          "Content-Type: text/html",
          "",
          '<img src="https://cdn.example/receipt.png">',
          "--b--",
        ].join("\r\n"),
      ),
    );
    expect(view.text).toBe("Trip fare 194,00 kr\nThanks for riding");
    expect(view.from).toBeNull();
    expect(view.date).toBeNull();
  });

  it("says so when the parser had to cut a very large body", () => {
    const view = emailView(eml(["Content-Type: text/html"], `<p>Start</p>${" ".repeat(MAX_BODY_CHARS)}<p>Total 10 kr</p>`));
    expect(view.text).toBe("Start");
    expect(view.truncated).toBe(true);
  });

  it("shortens long tracking links to their host", () => {
    const view = emailView(eml(["Content-Type: text/plain"], `Receipt total 10 EUR, see https://click.example.com/${"a".repeat(80)}?u=1`));
    expect(view.text).toBe("Receipt total 10 EUR, see click.example.com/…");
  });

  it("caps a very long message and says so", () => {
    const view = emailView(eml(["Content-Type: text/plain"], "line of a long receipt\n".repeat(5000)));
    expect(view.text.length).toBeLessThanOrEqual(MAX_VIEW_CHARS);
    expect(view.truncated).toBe(true);
  });
});

describe("textView", () => {
  it("tidies a text message", () => {
    expect(textView(Buffer.from("Köp 194,00 SEK\r\n\r\n\r\nICA\u0007"))).toEqual({ type: "txt", body: "Köp 194,00 SEK\n\nICA", truncated: false });
  });
});
