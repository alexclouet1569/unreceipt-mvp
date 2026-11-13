// Attachments of a raw RFC 5322 message (the .eml Resend gives us). Pure:
// no I/O, no dependency. Enough MIME to find the PDF or photo a customer
// forwarded: nested multipart, base64 and quoted-printable bodies, a
// message forwarded as an attachment (message/rfc822), a file sent as
// application/octet-stream (classified by its bytes), the filename from
// Content-Disposition or Content-Type. Anything exotic is simply not an
// attachment we read; the email text is still parsed.
// The MIME helpers are exported for src/lib/mailboxes/raw-message.ts, which
// reads the text parts of a message fetched from a connected mailbox.

import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, type AllowedUploadType } from "@/lib/receipts/upload-limits";

export type EmailAttachment = {
  filename: string | null;
  mediaType: AllowedUploadType;
  bytes: Buffer;
  // "attachment" or "inline" (a logo in the signature is inline).
  disposition: "attachment" | "inline";
};

type Part = { headers: Record<string, string>; body: Buffer };

// Ample for any receipt; keeps a hostile message from burning CPU.
const MAX_PARTS = 64;
const MAX_DEPTH = 6;

export function splitHeadersAndBody(raw: Buffer): { headers: Record<string, string>; body: Buffer } {
  const text = raw.toString("latin1");
  let sep = text.indexOf("\r\n\r\n");
  let sepLen = 4;
  const lf = text.indexOf("\n\n");
  if (sep === -1 || (lf !== -1 && lf < sep)) {
    sep = lf;
    sepLen = 2;
  }
  const headerText = sep === -1 ? text : text.slice(0, sep);
  const body = sep === -1 ? Buffer.alloc(0) : raw.subarray(Buffer.byteLength(text.slice(0, sep + sepLen), "latin1"));
  const headers: Record<string, string> = {};
  // Unfold continuation lines.
  const lines = headerText.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    // First occurrence wins (Content-Type appears once per part).
    if (!(name in headers)) headers[name] = value;
  }
  return { headers, body };
}

export function param(headerValue: string | undefined, name: string): string | null {
  if (!headerValue) return null;
  // RFC 2231 encoded names (filename*=UTF-8''...) and plain ones.
  const star = new RegExp(`${name}\\*=(?:[^']*'[^']*')?([^;]+)`, "i").exec(headerValue);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return star[1].trim().replace(/^"|"$/g, "");
    }
  }
  const plain = new RegExp(`${name}=("([^"]*)"|[^;\\s]+)`, "i").exec(headerValue);
  if (!plain) return null;
  return (plain[2] ?? plain[1]).trim();
}

export function mediaTypeOf(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

export function decodeBody(body: Buffer, encoding: string | undefined): Buffer {
  const enc = (encoding ?? "").trim().toLowerCase();
  if (enc === "base64") {
    return Buffer.from(body.toString("latin1").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  }
  if (enc === "quoted-printable") {
    const text = body
      .toString("latin1")
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(text, "latin1");
  }
  return body;
}

export function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const text = body.toString("latin1");
  const marker = `--${boundary}`;
  const parts: Buffer[] = [];
  let start = text.indexOf(marker);
  while (start !== -1 && parts.length < MAX_PARTS) {
    const lineEnd = text.indexOf("\n", start);
    if (lineEnd === -1) break;
    // Closing boundary.
    if (text.startsWith(`${marker}--`, start)) break;
    const next = text.indexOf(marker, lineEnd + 1);
    const chunk = text.slice(lineEnd + 1, next === -1 ? text.length : next).replace(/\r?\n$/, "");
    parts.push(Buffer.from(chunk, "latin1"));
    if (next === -1) break;
    start = next;
  }
  return parts;
}

// Types mail clients and invoicing systems put on a file they don't label
// (Outlook sends many PDFs as application/octet-stream), plus common
// misspellings of the real ones. Such a part is classified by its bytes.
const GENERIC_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
  "application/download",
  "application/x-download",
  "application/force-download",
  "application/unknown",
  "application/x-pdf",
  "application/acrobat",
  "image/jpg",
  "image/pjpeg",
  "image/x-png",
]);

/**
 * The upload type a file's own bytes say it is, or null: %PDF- (within the
 * first KB, as readers allow), JPEG FF D8 FF, PNG 89 50 4E 47, WebP
 * RIFF....WEBP. The bytes decide, never the filename: a wrong guess would
 * only send garbage to OCR.
 */
export function sniffUploadType(bytes: Buffer): AllowedUploadType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.subarray(0, 1024).includes("%PDF-", 0, "latin1")) return "application/pdf";
  return null;
}

type Walk = { out: EmailAttachment[]; visited: number };

function collect(raw: Buffer, depth: number, walk: Walk): void {
  // Every part visited counts, so a deeply nested hostile message can't
  // burn CPU even when it carries no file.
  if (depth > MAX_DEPTH || walk.out.length >= MAX_PARTS || walk.visited >= MAX_PARTS * 4) return;
  walk.visited++;
  const { headers, body }: Part = splitHeadersAndBody(raw);
  const type = mediaTypeOf(headers["content-type"]);

  if (type.startsWith("multipart/")) {
    const boundary = param(headers["content-type"], "boundary");
    if (!boundary) return;
    for (const part of splitMultipart(body, boundary)) collect(part, depth + 1, walk);
    return;
  }

  // "Forward as attachment": the receipt email sits inside this one, with
  // its own attachments.
  if (type === "message/rfc822") {
    collect(decodeBody(body, headers["content-transfer-encoding"]), depth + 1, walk);
    return;
  }

  const declared = (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(type);
  if (!declared && !GENERIC_TYPES.has(type)) return;
  // A part without a Content-Type is text/plain (RFC 2045) unless it is
  // explicitly a file.
  const dispositionHeader = headers["content-disposition"] ?? "";
  if (type === "" && !/^\s*attachment/i.test(dispositionHeader)) return;
  const disposition = dispositionHeader.toLowerCase().startsWith("inline") ? "inline" : "attachment";
  const filename = param(dispositionHeader, "filename") ?? param(headers["content-type"], "name");
  const bytes = decodeBody(body, headers["content-transfer-encoding"]);
  if (bytes.length === 0) return;
  const mediaType = declared ? (type as AllowedUploadType) : sniffUploadType(bytes);
  if (!mediaType) return;
  walk.out.push({ filename, mediaType, bytes, disposition });
}

/** Every PDF or image part of the message, in document order. */
export function extractAttachments(rawEml: Buffer): EmailAttachment[] {
  const walk: Walk = { out: [], visited: 0 };
  try {
    collect(rawEml, 0, walk);
  } catch {
    // A malformed message yields what was found so far.
  }
  return walk.out;
}

// Signature logos and tracking pixels are small inline images; a receipt
// photo or PDF is not.
const MIN_RECEIPT_BYTES = 8 * 1024;

/**
 * The attachment most likely to be the receipt: a PDF first (a digital
 * receipt or invoice), then the largest image that isn't a tiny inline
 * logo. Null when none fits the upload rules.
 */
export function pickReceiptAttachment(attachments: EmailAttachment[]): EmailAttachment | null {
  const usable = attachments.filter(
    (a) => a.bytes.length <= MAX_UPLOAD_BYTES && a.bytes.length >= MIN_RECEIPT_BYTES
  );
  const pdf = usable.find((a) => a.mediaType === "application/pdf" && a.disposition === "attachment")
    ?? usable.find((a) => a.mediaType === "application/pdf");
  if (pdf) return pdf;
  // A photo someone attached beats an inline image (a map, a big logo).
  const images = usable
    .filter((a) => a.mediaType !== "application/pdf")
    .sort((a, b) => b.bytes.length - a.bytes.length);
  return images.find((a) => a.disposition === "attachment") ?? images[0] ?? null;
}
