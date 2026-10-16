// SERVER-ONLY. Finds the receipt inside a forwarded email's attachments.
//
// Many receipts arrive as a PDF or photo attached to an email whose body
// only says "your receipt is attached" (hotels, SJ, SAS, SaaS invoices),
// and a phone's "share photo by email" sends a paper receipt the same way.
// The intake route reads the body first; when that doesn't give a receipt
// it reads the attachment this module picks with the same vision extractor
// as photo capture.
//
// The file type is decided from the file's own first bytes, never from the
// sender's Content-Type or filename, so a renamed file can't reach the
// vision call as something else.

import PostalMime from "postal-mime";
import {
  EXTENSION_BY_TYPE,
  MAX_PDF_PAGES,
  MAX_UPLOAD_BYTES,
  type AllowedUploadType,
} from "./upload-limits";
import { pdfPageCount } from "./pdf-pages";

export type ReceiptAttachment = {
  mediaType: AllowedUploadType;
  extension: string;
  bytes: Uint8Array;
};

// Below this an image is a logo, an icon or a tracking pixel, not a photo
// of a receipt. A phone photo of a receipt is well over 50 KB.
const MIN_IMAGE_BYTES = 20 * 1024;

export function sniffType(bytes: Uint8Array): AllowedUploadType | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  return null;
}

function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array | null {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return null;
}

/**
 * The one attachment worth reading as the receipt, or null. A PDF wins
 * over images (it's the invoice; images are usually logos), then the
 * largest image. Images embedded in the HTML body (multipart/related) are
 * layout, not receipts, and are skipped. Never throws: an unparseable
 * message just has no attachment.
 */
export async function findReceiptAttachment(
  rawEml: Uint8Array
): Promise<ReceiptAttachment | null> {
  let attachments: Awaited<ReturnType<typeof PostalMime.parse>>["attachments"];
  try {
    const email = await PostalMime.parse(rawEml, {
      attachmentEncoding: "arraybuffer",
      // Forwarded-as-attachment messages (Outlook "Forward as attachment")
      // are opened, so the receipt inside them is found too.
      maxRfc822NestingDepth: 3,
    });
    attachments = email.attachments;
  } catch {
    return null;
  }

  let bestPdf: ReceiptAttachment | null = null;
  let bestImage: ReceiptAttachment | null = null;

  for (const attachment of attachments) {
    if (attachment.related) continue;
    const bytes = toBytes(attachment.content);
    if (!bytes || bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) continue;
    const type = sniffType(bytes);
    if (!type) continue;

    if (type === "application/pdf") {
      // Unparseable or too long: not worth a vision call from a stranger.
      const pages = await pdfPageCount(bytes);
      if (pages == null || pages < 1 || pages > MAX_PDF_PAGES) continue;
      if (!bestPdf) bestPdf = { mediaType: type, extension: EXTENSION_BY_TYPE[type], bytes };
      continue;
    }

    if (bytes.length < MIN_IMAGE_BYTES) continue;
    if (!bestImage || bytes.length > bestImage.bytes.length) {
      bestImage = { mediaType: type, extension: EXTENSION_BY_TYPE[type], bytes };
    }
  }

  return bestPdf ?? bestImage;
}
