// SERVER-ONLY. Counts a PDF's pages with a real parser.
//
// The byte-scan in upload-limits.ts (countPdfPages) misses pages stored in
// compressed object streams (PDF 1.5+), which any PDF tool can produce, so
// on its own it lets a long document through to a paid vision call.

import { PDFDocument } from "pdf-lib";

/** Page count, or null when the file can't be parsed as a PDF. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    return doc.getPageCount();
  } catch {
    return null;
  }
}
