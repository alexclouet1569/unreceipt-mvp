// Browser-only. Shrinks a receipt photo before upload: phone cameras
// produce 3–12 MB images, which are slow on mobile data, cost more Claude
// tokens, and exceed the 4 MB upload cap. 2000px on the long edge keeps
// small print legible for OCR.
//
// Best-effort: anything unexpected (no canvas, decode failure, a result
// that isn't smaller) returns the original file unchanged.

export const MAX_IMAGE_EDGE = 2000;
const JPEG_QUALITY = 0.85;
// Below this size and edge length, re-encoding isn't worth the quality loss.
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function") return file;

  try {
    // imageOrientation applies the EXIF rotation, so portrait phone photos
    // stay upright once the EXIF data is gone from the JPEG.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= MAX_IMAGE_EDGE && file.size <= SKIP_BELOW_BYTES) {
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
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
