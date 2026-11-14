import { describe, expect, it } from "vitest";
import { extractAttachments, pickReceiptAttachment, sniffUploadType } from "@/lib/email/attachments";

const b64 = (s: string) => Buffer.from(s).toString("base64");
// Binary test bytes (written as latin1 strings).
const b64bin = (s: string) => Buffer.from(s, "latin1").toString("base64");
const pdfBytes = "%PDF-1.4\n" + "x".repeat(9000) + "\n/Type /Page\n%%EOF";
const bigJpeg = "\xFF\xD8" + "j".repeat(20000);

function eml(parts: string, boundary = "B1"): Buffer {
  return Buffer.from(
    [
      "From: kvitto@ica.se",
      "To: receipts+abc@in.unreceipt.com",
      "Subject: Kvitto",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      parts,
    ].join("\r\n"),
    "latin1"
  );
}

describe("extractAttachments", () => {
  it("finds a base64 PDF and an image in a nested multipart message", () => {
    const inner = [
      "--B2",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Tack för ditt köp",
      "--B2",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Tack</p>",
      "--B2--",
    ].join("\r\n");
    const raw = eml(
      [
        "--B1",
        'Content-Type: multipart/alternative; boundary="B2"',
        "",
        inner,
        "--B1",
        "Content-Type: application/pdf; name=kvitto.pdf",
        "Content-Transfer-Encoding: base64",
        'Content-Disposition: attachment; filename="kvitto 2026.pdf"',
        "",
        b64(pdfBytes).replace(/(.{76})/g, "$1\r\n"),
        "--B1",
        "Content-Type: image/png",
        "Content-Transfer-Encoding: base64",
        "Content-Disposition: inline; filename=logo.png",
        "",
        b64("\x89PNG tiny"),
        "--B1--",
      ].join("\r\n")
    );
    const atts = extractAttachments(raw);
    expect(atts.map((a) => [a.mediaType, a.filename, a.disposition])).toEqual([
      ["application/pdf", "kvitto 2026.pdf", "attachment"],
      ["image/png", "logo.png", "inline"],
    ]);
    expect(atts[0].bytes.toString("latin1")).toBe(pdfBytes);
  });

  it("decodes quoted-printable and RFC 2231 filenames, drops an octet-stream part that isn't a file we read", () => {
    const raw = eml(
      [
        "--B1",
        "Content-Type: application/octet-stream; name=data.bin",
        "Content-Transfer-Encoding: base64",
        "",
        b64("nope"),
        "--B1",
        "Content-Type: image/jpeg",
        "Content-Transfer-Encoding: quoted-printable",
        "Content-Disposition: attachment; filename*=UTF-8''kvitto%20%C3%A5.jpg",
        "",
        "=FF=D8abc=\r\ndef",
        "--B1--",
      ].join("\r\n")
    );
    const atts = extractAttachments(raw);
    expect(atts).toHaveLength(1);
    expect(atts[0].filename).toBe("kvitto å.jpg");
    expect(atts[0].bytes.toString("latin1")).toBe("\xFF\xD8abcdef");
  });

  it("classifies an application/octet-stream PDF or photo by its bytes (Outlook, invoicing systems)", () => {
    const png = "\x89PNG\r\n\x1a\n" + "p".repeat(100);
    const raw = eml(
      [
        "--B1",
        "Content-Type: text/plain",
        "",
        "Invoice attached",
        "--B1",
        'Content-Type: application/octet-stream; name="Faktura 1234.pdf"',
        "Content-Transfer-Encoding: base64",
        'Content-Disposition: attachment; filename="Faktura 1234.pdf"',
        "",
        b64(pdfBytes),
        "--B1",
        "Content-Type: application/octet-stream",
        "Content-Transfer-Encoding: base64",
        "Content-Disposition: attachment; filename=scan.bin",
        "",
        b64bin(png),
        "--B1",
        "Content-Type: image/jpg",
        "Content-Transfer-Encoding: base64",
        "Content-Disposition: attachment; filename=receipt.jpg",
        "",
        b64bin(bigJpeg.replace("\xFF\xD8", "\xFF\xD8\xFF")),
        "--B1",
        // A filename alone never makes a file: these bytes are no PDF.
        "Content-Type: application/octet-stream",
        "Content-Transfer-Encoding: base64",
        "Content-Disposition: attachment; filename=fake.pdf",
        "",
        b64bin("MZ\x90\x00 not a pdf"),
        "--B1--",
      ].join("\r\n")
    );
    const atts = extractAttachments(raw);
    expect(atts.map((a) => [a.mediaType, a.filename])).toEqual([
      ["application/pdf", "Faktura 1234.pdf"],
      ["image/png", "scan.bin"],
      ["image/jpeg", "receipt.jpg"],
    ]);
    expect(atts[0].bytes.toString("latin1")).toBe(pdfBytes);
    expect(pickReceiptAttachment(atts)).toBe(atts[0]);
  });

  it("reads the attachments of an email forwarded as an attachment (message/rfc822)", () => {
    const inner = [
      "From: billing@vendor.example",
      "Subject: Your invoice",
      'Content-Type: multipart/mixed; boundary="IN"',
      "",
      "--IN",
      "Content-Type: text/plain",
      "",
      "See the attached invoice.",
      "--IN",
      "Content-Type: application/pdf",
      "Content-Transfer-Encoding: base64",
      "Content-Disposition: attachment; filename=invoice.pdf",
      "",
      b64(pdfBytes),
      "--IN--",
    ].join("\r\n");
    const raw = eml(
      [
        "--B1",
        "Content-Type: text/plain",
        "",
        "FYI",
        "--B1",
        "Content-Type: message/rfc822",
        'Content-Disposition: attachment; filename="Your invoice.eml"',
        "",
        inner,
        "--B1--",
      ].join("\r\n")
    );
    const atts = extractAttachments(raw);
    expect(atts).toHaveLength(1);
    expect(atts[0]).toMatchObject({ mediaType: "application/pdf", filename: "invoice.pdf", disposition: "attachment" });
    expect(atts[0].bytes.toString("latin1")).toBe(pdfBytes);
  });

  it("stops at the nesting limit", () => {
    let msg = ["Content-Type: application/pdf", "Content-Transfer-Encoding: base64", "", b64(pdfBytes)].join("\r\n");
    for (let i = 0; i < 10; i++) msg = ["Content-Type: message/rfc822", "", msg].join("\r\n");
    expect(extractAttachments(Buffer.from(msg, "latin1"))).toEqual([]);
  });

  it("returns nothing for a plain message or garbage", () => {
    expect(extractAttachments(Buffer.from("Subject: hi\r\n\r\nplain"))).toEqual([]);
    expect(extractAttachments(Buffer.from('Content-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\n'))).toEqual([]);
  });
});

describe("sniffUploadType", () => {
  it("recognises PDF, JPEG, PNG and WebP by their first bytes, nothing else", () => {
    expect(sniffUploadType(Buffer.from("%PDF-1.7\n…", "latin1"))).toBe("application/pdf");
    expect(sniffUploadType(Buffer.from("\r\n%PDF-1.4", "latin1"))).toBe("application/pdf");
    expect(sniffUploadType(Buffer.from("\xFF\xD8\xFF\xE0", "latin1"))).toBe("image/jpeg");
    expect(sniffUploadType(Buffer.from("\x89PNG\r\n\x1a\n", "latin1"))).toBe("image/png");
    expect(sniffUploadType(Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(sniffUploadType(Buffer.from("RIFF\x10\x00\x00\x00WAVEfmt ", "latin1"))).toBeNull();
    expect(sniffUploadType(Buffer.from("PK\x03\x04 zip", "latin1"))).toBeNull();
    expect(sniffUploadType(Buffer.alloc(0))).toBeNull();
    expect(sniffUploadType(Buffer.concat([Buffer.alloc(2000), Buffer.from("%PDF-")]))).toBeNull();
  });
});

describe("pickReceiptAttachment", () => {
  const pdf = { filename: "a.pdf", mediaType: "application/pdf" as const, bytes: Buffer.from(pdfBytes, "latin1"), disposition: "attachment" as const };
  const photo = { filename: "p.jpg", mediaType: "image/jpeg" as const, bytes: Buffer.from(bigJpeg, "latin1"), disposition: "attachment" as const };
  const logo = { filename: "l.png", mediaType: "image/png" as const, bytes: Buffer.alloc(500), disposition: "inline" as const };

  it("prefers a PDF, then an attached image over a bigger inline one, never a tiny logo", () => {
    expect(pickReceiptAttachment([logo, photo, pdf])).toBe(pdf);
    expect(pickReceiptAttachment([logo, photo])).toBe(photo);
    const bigInline = { ...photo, filename: "map.jpg", bytes: Buffer.alloc(40000), disposition: "inline" as const };
    expect(pickReceiptAttachment([bigInline, photo])).toBe(photo);
    expect(pickReceiptAttachment([bigInline])).toBe(bigInline);
    expect(pickReceiptAttachment([logo])).toBeNull();
    expect(pickReceiptAttachment([])).toBeNull();
  });

  it("skips files over the upload cap", () => {
    const huge = { ...photo, bytes: Buffer.alloc(5 * 1024 * 1024) };
    expect(pickReceiptAttachment([huge])).toBeNull();
  });
});
