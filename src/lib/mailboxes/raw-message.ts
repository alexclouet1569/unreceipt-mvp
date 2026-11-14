// What the shared ingest (src/lib/email/ingest.ts) needs from a raw RFC 822
// message fetched from a connected mailbox (Gmail format=raw, Graph
// /$value): subject, sender address, Message-Id, and the first text/plain
// and text/html bodies. Pure, no dependency; the MIME walking reuses the
// helpers of src/lib/email/attachments.ts. Anything it can't read comes
// back empty: the attachment OCR and the review queue still work.

import {
  decodeBody,
  mediaTypeOf,
  param,
  splitHeadersAndBody,
  splitMultipart,
} from "@/lib/email/attachments";
import { parseAddressList } from "@/lib/email-address";

/**
 * The largest raw message a mailbox sync downloads (Gmail by its metadata
 * sizeEstimate and the decoded bytes, Graph by Content-Length and the
 * bytes); bigger ones are skipped. The original .eml is the receipt's
 * evidence, bounded like Resend's (src/lib/resend-inbound.ts) and well under
 * the storage cap of one file.
 */
export const MAX_RAW_BYTES = 15 * 1024 * 1024;

export type RawMessage = {
  subject: string;
  /** The From: address (lower case), or "" when there is none. */
  from: string;
  /** The Message-Id header as written, angle brackets included. */
  messageId: string | null;
  text: string | null;
  html: string | null;
};

// A receipt's text is short; this keeps a hostile message from feeding
// megabytes to the parser.
const MAX_BODY_CHARS = 512 * 1024;
const MAX_PARTS = 64;
const MAX_DEPTH = 6;

/** Bytes in a declared charset; unknown labels read as UTF-8. */
export function decodeCharset(bytes: Buffer, charset: string | null | undefined): string {
  const label = (charset ?? "").trim().replace(/^"|"$/g, "").toLowerCase();
  const name = !label || label === "us-ascii" || label === "ascii" ? "utf-8" : label;
  try {
    return new TextDecoder(name).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const ENCODED_WORD = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;

function wordBytes(encoding: string, data: string): Buffer {
  if (encoding.toUpperCase() === "B") return Buffer.from(data, "base64");
  const text = data
    .replace(/_/g, " ")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(text, "latin1");
}

/**
 * RFC 2047 encoded words ("=?UTF-8?B?…?="), with adjacent words of the same
 * charset joined before decoding (a multi-byte character may be split
 * across them) and the whitespace between them dropped.
 */
export function decodeEncodedWords(value: string): string {
  let out = "";
  let last = 0;
  let charset: string | null = null;
  let chunks: Buffer[] = [];
  const flush = () => {
    if (charset !== null) out += decodeCharset(Buffer.concat(chunks), charset);
    charset = null;
    chunks = [];
  };
  for (const m of value.matchAll(ENCODED_WORD)) {
    const start = m.index ?? 0;
    const gap = value.slice(last, start);
    const wordCharset = m[1].split("*")[0].toLowerCase();
    if (charset === null || charset !== wordCharset || !/^\s*$/.test(gap)) {
      flush();
      out += gap;
      charset = wordCharset;
    }
    chunks.push(wordBytes(m[2], m[3]));
    last = start + m[0].length;
  }
  flush();
  return out + value.slice(last);
}

/** A header value as read (latin1 bytes): raw UTF-8 (RFC 6532) and encoded words decoded. */
export function decodeHeaderValue(raw: string): string {
  const bytes = Buffer.from(raw, "latin1");
  const utf8 = bytes.toString("utf8");
  const text = utf8.includes("�") ? raw : utf8;
  return decodeEncodedWords(text).replace(/[\r\n]+/g, " ").trim();
}

type Bodies = { text: string | null; html: string | null; visited: number };

function walk(raw: Buffer, depth: number, out: Bodies): void {
  if (depth > MAX_DEPTH || out.visited >= MAX_PARTS * 4) return;
  if (out.text !== null && out.html !== null) return;
  out.visited++;
  const { headers, body } = splitHeadersAndBody(raw);
  // No Content-Type means text/plain (RFC 2045).
  const type = mediaTypeOf(headers["content-type"]) || "text/plain";

  if (type.startsWith("multipart/")) {
    const boundary = param(headers["content-type"], "boundary");
    if (!boundary) return;
    for (const part of splitMultipart(body, boundary)) walk(part, depth + 1, out);
    return;
  }
  // A message forwarded as an attachment: its text counts when the outer
  // message has none (the outer text comes first in document order).
  if (type === "message/rfc822") {
    walk(decodeBody(body, headers["content-transfer-encoding"]), depth + 1, out);
    return;
  }
  if (type !== "text/plain" && type !== "text/html") return;
  // A .txt or .html file attached to the mail isn't its body.
  if (/^\s*attachment/i.test(headers["content-disposition"] ?? "")) return;
  const key = type === "text/plain" ? "text" : "html";
  if (out[key] !== null) return;
  const decoded = decodeCharset(
    decodeBody(body, headers["content-transfer-encoding"]),
    param(headers["content-type"], "charset"),
  );
  out[key] = decoded.slice(0, MAX_BODY_CHARS);
}

export function parseRawMessage(rawEml: Buffer): RawMessage {
  const { headers } = splitHeadersAndBody(rawEml);
  const messageId = (headers["message-id"] ?? "").trim();
  const bodies: Bodies = { text: null, html: null, visited: 0 };
  try {
    walk(rawEml, 0, bodies);
  } catch {
    // A malformed message keeps what was read so far.
  }
  return {
    subject: decodeHeaderValue(headers["subject"] ?? "").slice(0, 500),
    // Parsed before decoding: an encoded display name may hide a comma.
    from: parseAddressList(headers["from"] ?? "")[0] ?? "",
    messageId: messageId.length > 0 && messageId.length <= 998 ? messageId : null,
    text: bodies.text,
    html: bodies.html,
  };
}
