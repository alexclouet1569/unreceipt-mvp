// Shared upload rules for receipt files — used by /api/ocr and
// /api/capture on the server and by the capture dialog in the browser.
// Pure constants, safe to import anywhere.

export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

// Vercel rejects function request bodies over 4.5 MB before our code runs,
// so a bigger cap here is unreachable in production. 4 MB leaves room for
// the multipart overhead and the other form fields. Photos are shrunk in
// the browser first (prepareImageForUpload), so only large PDFs hit this.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const EXTENSION_BY_TYPE: Record<AllowedUploadType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function isAllowedUploadType(type: string): type is AllowedUploadType {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(type);
}

// Cap PDF page count so a 50-page contract uploaded by mistake doesn't burn
// vision tokens. Counted via /Type /Page occurrences — works for the vast
// majority of PDFs we see in the wild; linearized PDFs may over-count but
// that's a safe-direction error (false rejects, not false accepts).
export const MAX_PDF_PAGES = 10;

export function countPdfPages(buf: Uint8Array): number {
  // Match `/Type /Page` (with optional whitespace) but exclude `/Pages`
  // (the catalog node). The negative lookahead `(?!s)` keeps the count
  // accurate on standard PDFs without parsing the cross-ref table.
  const matches = new TextDecoder("latin1").decode(buf).match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}
