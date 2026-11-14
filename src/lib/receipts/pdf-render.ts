// SERVER-ONLY. A receipt's PDF original shown as pictures: each page
// rendered to a PNG on the server (pdf.js + @napi-rs/canvas), so the website
// and the iPhone app show the PDF without a PDF viewer. What a viewer could
// do and a picture can't: run the PDF's JavaScript (pdf.js runs none here:
// scripting belongs to its separate viewer, and this build has no `eval`),
// follow a link, submit a form, or fetch anything (fonts and decoders come
// from node_modules, never the network). Both clients show only the PNG.
//
// Bounded for a hostile file: at most MAX_PDF_PAGES pages are shown, a page
// is drawn at most MAX_EDGE_PX on its long side and MAX_PIXELS in all, an
// embedded image larger than MAX_IMAGE_PIXELS isn't decoded, and a render
// that takes longer than RENDER_TIMEOUT_MS is cancelled.

import path from "node:path";
import { MAX_PDF_PAGES } from "./pdf-pages";

/** Width a page is drawn at (pinch-zoom room on a phone: ~4× a 390 pt screen). */
export const TARGET_WIDTH_PX = 1600;
const MAX_EDGE_PX = 6000;
const MAX_PIXELS = 1600 * 6000;
const MAX_IMAGE_PIXELS = 40_000_000;
const RENDER_TIMEOUT_MS = 15_000;

export type PdfPageSize = { width: number; height: number };

export class PdfPreviewError extends Error {
  constructor(readonly reason: "unreadable" | "page_out_of_range" | "timeout") {
    super(reason);
    this.name = "PdfPreviewError";
  }
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Node has no Web Worker: pdf.js runs its parser in this process when
      // the worker module is handed over here (a literal import, so the
      // deployment's file tracing includes it).
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
      return pdfjs;
    })().catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

// Font, character map and image-decoder data shipped with pdf.js, read from
// disk (next.config.ts adds these folders to the page route's files).
function assetDir(name: string): string {
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", name) + path.sep;
}

async function openPdf(bytes: Uint8Array) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    // A copy: pdf.js takes ownership of (and detaches) the buffer it's given.
    data: new Uint8Array(bytes),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: assetDir("standard_fonts"),
    cMapUrl: assetDir("cmaps"),
    cMapPacked: true,
    wasmUrl: assetDir("wasm"),
    iccUrl: assetDir("iccs"),
    maxImageSize: MAX_IMAGE_PIXELS,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    verbosity: 0,
  });
  try {
    return { doc: await task.promise, task };
  } catch {
    await task.destroy().catch(() => {});
    // Encrypted with a password, damaged, or not a PDF at all.
    throw new PdfPreviewError("unreadable");
  }
}

/** Pages shown (at most MAX_PDF_PAGES) with their sizes in PDF points, and the document's page count. */
export async function pdfPreviewInfo(bytes: Uint8Array): Promise<{ pages: PdfPageSize[]; total: number }> {
  const { doc, task } = await openPdf(bytes);
  try {
    const total = doc.numPages;
    const pages: PdfPageSize[] = [];
    for (let n = 1; n <= Math.min(total, MAX_PDF_PAGES); n++) {
      const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
      pages.push({ width: Math.round(vp.width), height: Math.round(vp.height) });
    }
    return { pages, total };
  } catch (err) {
    if (err instanceof PdfPreviewError) throw err;
    throw new PdfPreviewError("unreadable");
  } finally {
    await task.destroy().catch(() => {});
  }
}

/** The scale that draws a page TARGET_WIDTH_PX wide, within the pixel bounds. */
export function renderScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const scale = Math.min(
    TARGET_WIDTH_PX / width,
    MAX_EDGE_PX / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  return Math.max(scale, 0.01);
}

/** One page (1-based, within the pages shown) as a PNG on a white ground. */
export async function renderPdfPage(bytes: Uint8Array, pageNumber: number): Promise<Buffer> {
  const { doc, task } = await openPdf(bytes);
  try {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > Math.min(doc.numPages, MAX_PDF_PAGES)) {
      throw new PdfPreviewError("page_out_of_range");
    }
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: renderScale(base.width, base.height) });
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const render = page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      // Form fields and annotations are drawn as they print, never as
      // live widgets (there are none on a picture anyway).
      annotationMode: 1,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        render.cancel();
        reject(new PdfPreviewError("timeout"));
      }, RENDER_TIMEOUT_MS);
    });
    try {
      await Promise.race([render.promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
    return await canvas.encode("png");
  } catch (err) {
    if (err instanceof PdfPreviewError) throw err;
    throw new PdfPreviewError("unreadable");
  } finally {
    await task.destroy().catch(() => {});
  }
}
