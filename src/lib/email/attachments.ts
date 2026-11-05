// Attachments of a raw RFC 5322 message (the .eml Resend gives us). Pure:
// no I/O, no dependency. Enough MIME to find the PDF or photo a customer
// forwarded: nested multipart, base64 and quoted-printable bodies, the
// filename from Content-Disposition or Content-Type. Anything exotic is
// simply not an attachment we read; the email text is still parsed.

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

function splitHeadersAndBody(raw: Buffer): { headers: Record<string, string>; body: Buffer } {
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

function param(headerValue: string | undefined, name: string): string | null {
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

function mediaTypeOf(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

function decodeBody(body: Buffer, encoding: string | undefined): Buffer {
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

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
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

function collect(raw: Buffer, depth: number, out: EmailAttachment[]): void {
  if (depth > MAX_DEPTH || out.length >= MAX_PARTS) return;
  const { headers, body }: Part = splitHeadersAndBody(raw);
  const type = mediaTypeOf(headers["content-type"]);

  if (type.startsWith("multipart/")) {
    const boundary = param(headers["content-type"], "boundary");
    if (!boundary) return;
    for (const part of splitMultipart(body, boundary)) collect(part, depth + 1, out);
    return;
  }

  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(type)) return;
  const disposition = (headers["content-disposition"] ?? "").toLowerCase().startsWith("inline")
    ? "inline"
    : "attachment";
  const filename =
    param(headers["content-disposition"], "filename") ?? param(headers["content-type"], "name");
  const bytes = decodeBody(body, headers["content-transfer-encoding"]);
  if (bytes.length === 0) return;
  out.push({ filename, mediaType: type as AllowedUploadType, bytes, disposition });
}

/** Every PDF or image part of the message, in document order. */
export function extractAttachments(rawEml: Buffer): EmailAttachment[] {
  const out: EmailAttachment[] = [];
  try {
    collect(rawEml, 0, out);
  } catch {
    // A malformed message yields what was found so far.
  }
  return out;
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
  const images = usable
    .filter((a) => a.mediaType !== "application/pdf")
    .sort((a, b) => b.bytes.length - a.bytes.length);
  return images[0] ?? null;
}
