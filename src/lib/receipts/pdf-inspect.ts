// What a PDF is before we cut it into pages (browser and server). Pure
// apart from parsing; pdf-lib is loaded only when called.
//
// A multi-page scan may be split into one receipt per page only when the
// split loses nothing: an encrypted PDF, or one that carries files (a
// Factur-X / ZUGFeRD or Swedish PDF+XML e-invoice embeds its XML, which is
// the invoice itself), is kept and read whole. In every case the file as
// received is stored byte for byte as the original (compliance review
// 2026-11-09: BFL 7 kap. 1 § "i det skick", 7 kap. 6 § transfer).

export type PdfShape = { pages: number; encrypted: boolean; hasAttachments: boolean };

export async function inspectPdf(bytes: Uint8Array): Promise<PdfShape | null> {
  try {
    const { PDFDocument, PDFDict, PDFName } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
    const embedded = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
    const associated = doc.catalog.get(PDFName.of("AF"));
    return {
      pages: doc.getPageCount(),
      encrypted: doc.isEncrypted,
      hasAttachments: Boolean(embedded) || Boolean(associated),
    };
  } catch {
    return null;
  }
}

/** Whether each page may become its own receipt. */
export function canSplit(shape: PdfShape): boolean {
  return shape.pages > 1 && !shape.encrypted && !shape.hasAttachments;
}
