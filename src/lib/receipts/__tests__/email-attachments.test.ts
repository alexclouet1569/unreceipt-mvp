// @vitest-environment node

import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { findReceiptAttachment, sniffType } from "../email-attachments";

async function makePdf(pages: number, { objectStreams = false } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  return Buffer.from(await doc.save({ useObjectStreams: objectStreams }));
}

let PDF_BYTES: Buffer;
beforeAll(async () => {
  PDF_BYTES = await makePdf(1);
});
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40 * 1024, 7)]);
const SMALL_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(500, 1),
]);

type Part = { type: string; filename?: string; body: Buffer; inline?: string };

function part(p: Part): string {
  const disposition = p.inline
    ? `Content-Disposition: inline\r\nContent-ID: <${p.inline}>`
    : `Content-Disposition: attachment; filename="${p.filename ?? "file"}"`;
  return [
    `Content-Type: ${p.type}${p.filename ? `; name="${p.filename}"` : ""}`,
    "Content-Transfer-Encoding: base64",
    disposition,
    "",
    p.body.toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
}

function eml(parts: Part[], { related = [] as Part[] } = {}): Buffer {
  const lines = [
    "From: Hotel <noreply@hotel.example>",
    "To: anna@example.com",
    "Subject: Your receipt",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="mixed"',
    "",
    "--mixed",
  ];
  if (related.length > 0) {
    lines.push('Content-Type: multipart/related; boundary="rel"', "", "--rel");
    lines.push("Content-Type: text/html; charset=utf-8", "", "<p>Your receipt is attached.</p><img src=\"cid:logo\">");
    for (const r of related) lines.push("--rel", part(r));
    lines.push("--rel--", "--mixed");
  } else {
    lines.push("Content-Type: text/plain; charset=utf-8", "", "Your receipt is attached.", "--mixed");
  }
  parts.forEach((p, i) => {
    lines.push(part(p));
    lines.push(i === parts.length - 1 ? "--mixed--" : "--mixed");
  });
  if (parts.length === 0) lines[lines.length - 1] = "--mixed--";
  return Buffer.from(lines.join("\r\n"));
}

describe("sniffType", () => {
  it("recognises the four allowed formats by their bytes", () => {
    expect(sniffType(PDF_BYTES)).toBe("application/pdf");
    expect(sniffType(JPEG_BYTES)).toBe("image/jpeg");
    expect(sniffType(SMALL_PNG)).toBe("image/png");
    expect(sniffType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffType(Buffer.from("<html>"))).toBeNull();
  });
});

describe("findReceiptAttachment", () => {
  it("returns the attached PDF", async () => {
    const found = await findReceiptAttachment(
      eml([{ type: "application/pdf", filename: "receipt.pdf", body: PDF_BYTES }]),
    );
    expect(found?.mediaType).toBe("application/pdf");
    expect(found?.extension).toBe("pdf");
    expect(Buffer.from(found!.bytes).equals(PDF_BYTES)).toBe(true);
  });

  it("returns a phone photo of a paper receipt", async () => {
    const found = await findReceiptAttachment(
      eml([{ type: "image/jpeg", filename: "IMG_1234.jpeg", body: JPEG_BYTES }]),
    );
    expect(found?.mediaType).toBe("image/jpeg");
  });

  it("prefers a PDF over an image", async () => {
    const found = await findReceiptAttachment(
      eml([
        { type: "image/jpeg", filename: "photo.jpg", body: JPEG_BYTES },
        { type: "application/pdf", filename: "invoice.pdf", body: PDF_BYTES },
      ]),
    );
    expect(found?.mediaType).toBe("application/pdf");
  });

  it("ignores logos embedded in the HTML body and tiny images", async () => {
    const found = await findReceiptAttachment(
      eml([{ type: "image/png", filename: "icon.png", body: SMALL_PNG }], {
        related: [{ type: "image/jpeg", body: JPEG_BYTES, inline: "logo" }],
      }),
    );
    expect(found).toBeNull();
  });

  it("decides the type from the bytes, not the declared type or name", async () => {
    const found = await findReceiptAttachment(
      eml([{ type: "application/pdf", filename: "receipt.pdf", body: Buffer.from("<script>alert(1)</script>") }]),
    );
    expect(found).toBeNull();

    const relabelled = await findReceiptAttachment(
      eml([{ type: "application/octet-stream", filename: "scan", body: PDF_BYTES }]),
    );
    expect(relabelled?.mediaType).toBe("application/pdf");
  });

  it("skips PDFs with more pages than OCR accepts, compressed or not", async () => {
    for (const objectStreams of [false, true]) {
      const longPdf = await makePdf(11, { objectStreams });
      const found = await findReceiptAttachment(
        eml([{ type: "application/pdf", filename: "contract.pdf", body: longPdf }]),
      );
      expect(found).toBeNull();
    }
  });

  it("skips a file that starts like a PDF but isn't one", async () => {
    const fake = Buffer.from("%PDF-1.4\nnot really a pdf");
    const found = await findReceiptAttachment(
      eml([{ type: "application/pdf", filename: "receipt.pdf", body: fake }]),
    );
    expect(found).toBeNull();
  });

  it("finds the receipt inside an email forwarded as an attachment", async () => {
    const inner = eml([{ type: "application/pdf", filename: "receipt.pdf", body: PDF_BYTES }]);
    const outer = Buffer.from(
      [
        "From: anna@example.com",
        "To: receipts+abc@in.unreceipt.com",
        "Subject: Fwd: Your receipt",
        "MIME-Version: 1.0",
        'Content-Type: multipart/mixed; boundary="outer"',
        "",
        "--outer",
        "Content-Type: text/plain",
        "",
        "See attached.",
        "--outer",
        "Content-Type: message/rfc822",
        "",
        inner.toString("latin1"),
        "--outer--",
      ].join("\r\n"),
      "latin1",
    );
    const found = await findReceiptAttachment(outer);
    expect(found?.mediaType).toBe("application/pdf");
  });

  it("returns null for a plain email or garbage", async () => {
    expect(await findReceiptAttachment(eml([]))).toBeNull();
    expect(await findReceiptAttachment(Buffer.from("not an email at all"))).toBeNull();
  });
});
