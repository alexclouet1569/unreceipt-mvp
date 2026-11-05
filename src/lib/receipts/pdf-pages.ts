// Page count of a PDF by counting `/Type /Page` objects (never `/Pages`,
// the catalog node). No cross-ref parsing: right for the vast majority of
// PDFs; linearised files may over-count, which errs towards refusing a
// large file rather than accepting one. Shared by /api/ocr, /reprocess and
// the email intake so every path applies the same cap.

export const MAX_PDF_PAGES = 10;

export function countPdfPages(buf: Buffer): number {
  const matches = buf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}
