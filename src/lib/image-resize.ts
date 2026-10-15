// Browser-only. Shrinks a receipt photo before upload: phone cameras
// produce 3–12 MB images, which are slow on mobile data, cost more Claude
// tokens, and exceed the 4 MB upload cap. 2000px on the long edge keeps
// small print legible for OCR.
//
// Best-effort: anything unexpected (no canvas, decode failure, a result
// that isn't smaller) returns the original file unchanged.
//
// iPhone HEIC photos: iOS Safari already hands the page a JPEG when the
// input accepts `image/*`, and Safari on macOS can decode HEIC, so both get
// re-encoded to JPEG here. Chrome (desktop and Android) can't decode HEIC
// (checked in Chromium 2026-10-15: createImageBitmap throws), so the
// original comes back still HEIC — callers check `isAllowedUploadType` and
// show `HEIC_UNSUPPORTED_MESSAGE` instead of uploading a file the server
// would refuse.

import { isAllowedUploadType } from "@/lib/receipts/upload-limits";

export const MAX_IMAGE_EDGE = 2000;
const JPEG_QUALITY = 0.85;
// Below this size and edge length, re-encoding isn't worth the quality loss.
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;

export const HEIC_UNSUPPORTED_MESSAGE =
  "This photo is in iPhone's HEIC format, which this browser can't convert. " +
  "Open UnReceipt in Safari on your iPhone, or export the photo as JPEG " +
  "(on iPhone: Settings → Camera → Formats → Most Compatible) and try again.";

export const UNSUPPORTED_FILE_MESSAGE =
  "This file type isn't supported. Use a JPEG, PNG or WebP photo, or a PDF.";

/** HEIC/HEIF by MIME type or, when the browser reports none, by extension. */
export function isHeicLike(file: Pick<File, "type" | "name">): boolean {
  if (/^image\/hei[cf](-sequence)?$/i.test(file.type)) return true;
  return file.type === "" && /\.(heic|heif)$/i.test(file.name);
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !isHeicLike(file)) return file;
  if (typeof createImageBitmap !== "function") return file;
  // Formats the server doesn't accept (HEIC) must be converted whatever
  // their size; accepted ones only when it's worth it.
  const mustConvert = !isAllowedUploadType(file.type);

  try {
    // imageOrientation applies the EXIF rotation, so portrait phone photos
    // stay upright once the EXIF data is gone from the JPEG.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (!mustConvert && longEdge <= MAX_IMAGE_EDGE && file.size <= SKIP_BELOW_BYTES) {
      bitmap.close();
      return file;
    }

    const scale = Math.min(1, MAX_IMAGE_EDGE / longEdge);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;
    if (!mustConvert && blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
