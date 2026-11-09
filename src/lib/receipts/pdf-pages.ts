// Page count of a PDF, shared by /api/ocr, /api/capture/scan and the email
// intake so every path applies the same cap before a PDF reaches Claude.
//
// pdfPageCount() parses the document with pdf-lib, which also finds pages
// stored in compressed object streams (a byte scan sees none there, so a
// 200-page file would pass as 0 pages: security review 2026-11-09). The
// answer is the larger of the parsed count and the byte scan, so a file
// that confuses one method is still caught by the other. A PDF pdf-lib
// can't open at all answers null: callers refuse it.

export const MAX_PDF_PAGES = 10;

/** `/Type /Page` objects in the raw bytes (never `/Pages`). Misses compressed object streams. */
export function countPdfPages(buf: Buffer): number {
  const matches = buf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

export async function pdfPageCount(buf: Buffer): Promise<number | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true, updateMetadata: false });
    return Math.max(doc.getPageCount(), countPdfPages(buf));
  } catch {
    return null;
  }
}
