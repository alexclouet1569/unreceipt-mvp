// @vitest-environment node

import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import {
  knownHeavy,
  PdfPreviewError,
  pdfPreviewInfo,
  rememberHeavy,
  renderPdfPage,
  renderScale,
  TARGET_WIDTH_PX,
} from "../pdf-render";

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

describe("a hostile PDF", () => {
  // A tiny file whose one page asks for millions of path operations: it
  // blocked the thread for 18 s before pdf.js moved into a worker
  // (security review 2026-11-14).
  function pdfBomb(): Uint8Array {
    const unit = Buffer.from("0 0 m 1 1 l S\n");
    const raw = Buffer.alloc(40 * 1024 * 1024);
    for (let i = 0; i < raw.length; i += unit.length) unit.copy(raw, i, 0, Math.min(unit.length, raw.length - i));
    const z = deflateSync(raw, { level: 9 });
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    ];
    let out = Buffer.from("%PDF-1.4\n");
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(out.length);
      out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`)]);
    });
    offsets.push(out.length);
    out = Buffer.concat([out, Buffer.from(`4 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z, Buffer.from("\nendstream\nendobj\n")]);
    const xref = out.length;
    const table = `xref\n0 5\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    return Buffer.concat([out, Buffer.from(`${table}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)]);
  }

  it("is stopped on time, and the thread stays free meanwhile", async () => {
    const bomb = pdfBomb();
    expect(bomb.length).toBeLessThan(100_000);
    let ticks = 0;
    const ticker = setInterval(() => ticks++, 50);
    const started = Date.now();
    const outcome = await renderPdfPage(bomb, 1, { timeoutMs: 1500 }).catch((err: PdfPreviewError) => err.reason);
    clearInterval(ticker);
    expect(["timeout", "too_heavy"]).toContain(outcome);
    expect(Date.now() - started).toBeLessThan(4000);
    // The event loop kept running while the worker was busy.
    expect(ticks).toBeGreaterThan(10);
  }, 15_000);

  it("remembers a heavy file for a while", () => {
    expect(knownHeavy("receipt-originals/u/x.pdf")).toBe(false);
    rememberHeavy("receipt-originals/u/x.pdf");
    expect(knownHeavy("receipt-originals/u/x.pdf")).toBe(true);
  });
});

describe("the PDF worker queue", () => {
  it("lets a few jobs wait and refuses the rest as busy", async () => {
    const pdf = await receiptPdf(1);
    const outcomes = await Promise.all(
      Array.from({ length: 7 }, () => renderPdfPage(pdf, 1).then(() => "png").catch((err: PdfPreviewError) => err.reason)),
    );
    // One runs, four wait their turn, the last two are told to come back.
    expect(outcomes.filter((o) => o === "png")).toHaveLength(5);
    expect(outcomes.filter((o) => o === "busy")).toHaveLength(2);
  }, 30_000);
});
