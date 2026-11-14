// @vitest-environment node

import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { PdfPreviewError, pdfPreviewInfo, renderPdfPage, renderScale, TARGET_WIDTH_PX } from "../pdf-render";

async function receiptPdf(pages: number, withJs = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage([300, 500]).drawText(`Page ${i + 1} Total 20.00`, { x: 20, y: 400, size: 14, font });
  }
  if (withJs) {
    // An OpenAction that would run JavaScript in a viewer.
    const action = doc.context.obj({ Type: "Action", S: "JavaScript", JS: PDFString.of("app.alert('x')") });
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(action));
  }
  return doc.save();
}

const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

describe("renderScale", () => {
  it("draws a normal page TARGET_WIDTH_PX wide", () => {
    expect(renderScale(595, 842) * 595).toBeCloseTo(TARGET_WIDTH_PX);
  });
  it("bounds a long receipt and a huge page", () => {
    // A 30 cm thermal strip: the long side stays within 6000 px.
    expect(renderScale(220, 8000) * 8000).toBeLessThanOrEqual(6000);
    expect(renderScale(14400, 14400) * 14400).toBeLessThanOrEqual(6000);
    expect(renderScale(0, 100)).toBe(1);
  });
});

describe("pdfPreviewInfo / renderPdfPage", () => {
  it("lists at most 10 pages and the document's count", async () => {
    const info = await pdfPreviewInfo(await receiptPdf(12));
    expect(info.total).toBe(12);
    expect(info.pages).toHaveLength(10);
    expect(info.pages[0]).toEqual({ width: 300, height: 500 });
  });

  it("draws a page as a PNG, a PDF with JavaScript included", async () => {
    const png = await renderPdfPage(await receiptPdf(2, true), 2);
    expect(isPng(png)).toBe(true);
    // 1600 px wide (IHDR width at bytes 16-19).
    expect(png.readUInt32BE(16)).toBe(TARGET_WIDTH_PX);
  });

  it("refuses a page past the end or past the 10 shown", async () => {
    await expect(renderPdfPage(await receiptPdf(1), 2)).rejects.toMatchObject({ reason: "page_out_of_range" });
    await expect(renderPdfPage(await receiptPdf(11), 11)).rejects.toMatchObject({ reason: "page_out_of_range" });
  });

  it("answers unreadable for something that isn't a PDF", async () => {
    await expect(renderPdfPage(new TextEncoder().encode("hello"), 1)).rejects.toBeInstanceOf(PdfPreviewError);
    await expect(pdfPreviewInfo(new TextEncoder().encode("%PDF-1.7 garbage"))).rejects.toMatchObject({ reason: "unreadable" });
  });
});
