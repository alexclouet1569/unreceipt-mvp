import { describe, expect, it } from "vitest";
import { extractAttachments, pickReceiptAttachment } from "@/lib/email/attachments";

const b64 = (s: string) => Buffer.from(s).toString("base64");
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

  it("decodes quoted-printable and RFC 2231 filenames, ignores other types", () => {
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

  it("returns nothing for a plain message or garbage", () => {
    expect(extractAttachments(Buffer.from("Subject: hi\r\n\r\nplain"))).toEqual([]);
    expect(extractAttachments(Buffer.from('Content-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\n'))).toEqual([]);
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
