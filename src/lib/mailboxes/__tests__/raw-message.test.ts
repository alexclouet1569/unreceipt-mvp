// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeCharset, decodeEncodedWords, decodeHeaderValue, parseRawMessage } from "../raw-message";

const eml = (lines: string[]) => Buffer.from(lines.join("\r\n"), "latin1");

describe("decodeEncodedWords", () => {
  it("decodes B and Q words and joins adjacent ones split inside a character", () => {
    // "Kvitto för köp" with "ö" (c3 b6) split across two B words.
    const a = Buffer.from([0x4b, 0x76, 0x69, 0x74, 0x74, 0x6f, 0x20, 0x66, 0xc3]).toString("base64");
    const b = Buffer.from([0xb6, 0x72, 0x20, 0x6b, 0xc3, 0xb6, 0x70]).toString("base64");
    expect(decodeEncodedWords(`=?UTF-8?B?${a}?= =?UTF-8?B?${b}?=`)).toBe("Kvitto för köp");
    expect(decodeEncodedWords("=?iso-8859-1?Q?Re=E7u_de_paiement?=")).toBe("Reçu de paiement");
    expect(decodeEncodedWords("Order =?utf-8?q?bekr=C3=A4ftelse?= #12")).toBe("Order bekräftelse #12");
  });

  it("leaves plain text and broken words alone", () => {
    expect(decodeEncodedWords("Your receipt")).toBe("Your receipt");
    expect(decodeEncodedWords("=?x-unknown?B?SGVq?=")).toBe("Hej");
  });
});

describe("decodeHeaderValue", () => {
  it("reads raw UTF-8 headers (RFC 6532)", () => {
    expect(decodeHeaderValue(Buffer.from("Kvitto för köp", "utf8").toString("latin1"))).toBe("Kvitto för köp");
  });
});

describe("decodeCharset", () => {
  it("falls back to UTF-8 for unknown labels", () => {
    expect(decodeCharset(Buffer.from("hej", "utf8"), "x-nonsense")).toBe("hej");
    expect(decodeCharset(Buffer.from([0xe9]), "windows-1252")).toBe("é");
  });
});

describe("parseRawMessage", () => {
  it("reads subject, sender, Message-Id and both bodies of a multipart message", () => {
    const html = Buffer.from("<p>Total 129,00 kr</p>", "utf8").toString("base64");
    const msg = parseRawMessage(
      eml([
        "From: =?UTF-8?Q?Sm=C3=A5land,_Butik?= <Kvitto@Butik.se>",
        "To: anna@gmail.com",
        "Subject: =?UTF-8?Q?Ditt_kvitto_fr=C3=A5n_Butik?=",
        "Message-ID: <abc123@butik.se>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/alternative; boundary="b1"',
        "",
        "--b1",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Summa 129,00 kr =E2=80=94 tack f=C3=B6r ditt k=C3=B6p",
        "--b1",
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        html,
        "--b1--",
        "",
      ]),
    );
    expect(msg).toEqual({
      subject: "Ditt kvitto från Butik",
      from: "kvitto@butik.se",
      messageId: "<abc123@butik.se>",
      text: "Summa 129,00 kr — tack för ditt köp",
      html: "<p>Total 129,00 kr</p>",
    });
  });

  it("skips attached text files and reads a forwarded message's text when the outer has none", () => {
    const msg = parseRawMessage(
      eml([
        "From: anna@gmail.com",
        "Subject: Fwd: receipt",
        'Content-Type: multipart/mixed; boundary="m"',
        "",
        "--m",
        'Content-Type: text/plain; name="notes.txt"',
        "Content-Disposition: attachment; filename=notes.txt",
        "",
        "not the body",
        "--m",
        "Content-Type: message/rfc822",
        "",
        "From: shop@example.com",
        "Subject: Receipt",
        "Content-Type: text/plain; charset=iso-8859-1",
        "",
        "Re\xe7u 12,00 \xe2",
        "--m--",
        "",
      ]),
    );
    expect(msg.text).toBe("Reçu 12,00 â");
    expect(msg.html).toBeNull();
    expect(msg.subject).toBe("Fwd: receipt");
  });

  it("treats a message without Content-Type as text and tolerates missing headers", () => {
    const msg = parseRawMessage(Buffer.from("Subject: hi\n\nplain body\n"));
    expect(msg).toMatchObject({ subject: "hi", from: "", messageId: null, text: "plain body\n", html: null });
  });
});
