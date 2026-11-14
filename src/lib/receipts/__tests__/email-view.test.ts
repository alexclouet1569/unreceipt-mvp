// @vitest-environment node

import { describe, expect, it } from "vitest";
import { decodeEntities, emailView, htmlToText, MAX_VIEW_CHARS, textView } from "../email-view";

const eml = (headers: string[], body: string) => Buffer.from([...headers, "", body].join("\r\n"), "utf8");

describe("htmlToText", () => {
  it("keeps the words and the layout's line breaks, drops every tag", () => {
    const html =
      '<html><head><title>T</title><style>.x{}</style></head><body>' +
      '<div style="display:none">Preview text</div>' +
      '<table><tr><td>Coffee</td><td>45,00 kr</td></tr><tr><td>Total</td><td><b>45,00&nbsp;kr</b></td></tr></table>' +
      '<p>Thanks&nbsp;&amp; welcome back</p><img src="https://pixel.example/o.gif" alt="x">' +
      '<script>fetch("https://evil.example")</script><a href="https://x.example/track?id=1">View in browser</a></body></html>';
    const text = htmlToText(html);
    expect(text).toContain("Coffee 45,00 kr");
    expect(text).toContain("Total 45,00 kr");
    expect(text).toContain("Thanks & welcome back");
    expect(text).toContain("View in browser");
    expect(text).not.toMatch(/[<>]|pixel\.example|evil\.example|x\.example|\.x\{\}/);
  });

  it("removes padding characters mail templates hide text with", () => {
    expect(htmlToText("<p>Hello͏ ‌​ world</p>")).toBe("Hello world");
  });

  it("stays fast on hostile HTML (unclosed tags, comments, script)", () => {
    const hostile = "<".repeat(200_000) + "<!--".repeat(50_000) + "<script>".repeat(50_000) + "<style".repeat(50_000);
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
  it("prefers the text part, decodes quoted-printable and encoded headers", () => {
    const view = emailView(
      eml(
        [
          "From: =?UTF-8?Q?Caf=C3=A9_Ol=C3=A9?= <hej@cafe.example>",
          "Subject: =?UTF-8?B?S3ZpdHRvIGZyw6VuIENhZsOp?=",
          "Date: Fri, 9 May 2026 09:18:00 +0200",
          'Content-Type: multipart/alternative; boundary="b"',
        ],
        [
          "--b",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: quoted-printable",
          "",
          "Kaffe 45,00 kr=0D=0ATotalt att betala: 45,00 kr, tack f=C3=B6r bes=C3=B6ket!",
          "--b",
          "Content-Type: text/html; charset=utf-8",
          "",
          "<p>HTML version</p>",
          "--b--",
        ].join("\r\n"),
      ),
    );
    expect(view.from).toBe("Café Olé <hej@cafe.example>");
    expect(view.subject).toBe("Kvitto från Café");
    expect(view.date).toBe("2026-05-09T07:18:00.000Z");
    expect(view.text).toContain("tack för besöket");
    expect(view.text).not.toContain("HTML version");
    expect(view.truncated).toBe(false);
  });

  it("reads the HTML part when the text part is only a stub", () => {
    const view = emailView(
      eml(
        ['Content-Type: multipart/alternative; boundary="b"'],
        [
          "--b",
          "Content-Type: text/plain",
          "",
          "View online",
          "--b",
          "Content-Type: text/html; charset=utf-8",
          "Content-Transfer-Encoding: base64",
          "",
          Buffer.from("<table><tr><td>Trip fare</td><td>194,00 kr</td></tr></table>").toString("base64"),
          "--b--",
        ].join("\r\n"),
      ),
    );
    expect(view.text).toBe("Trip fare 194,00 kr");
    expect(view.from).toBeNull();
    expect(view.date).toBeNull();
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
