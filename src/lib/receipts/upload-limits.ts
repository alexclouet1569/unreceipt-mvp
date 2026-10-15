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
