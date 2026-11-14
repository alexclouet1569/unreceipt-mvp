// Runs inside the worker thread kept by src/lib/receipts/pdf-render.ts: for
// each job it opens one PDF with pdf.js and answers either its page sizes
// ("info") or one page drawn as a PNG ("render"), then closes the document.
// pdf.js parses and draws synchronously, so a hostile file can keep this
// thread busy or fill memory; the parent kills the thread on a timer or a
// memory budget and starts a fresh one for the next job. Plain JavaScript,
// loaded by path at run time (next.config.ts lists it with pdf.js's files).

import { parentPort, workerData } from "node:worker_threads";

const { maxPages, targetWidth, maxEdge, maxPixels, maxImagePixels, assets } = workerData;

// Loaded once per thread: the slow part of a first job (~1 s).
const ready = (async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // No Web Worker in Node: pdf.js parses in this thread when handed its
  // worker module.
  globalThis.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  return { pdfjs, createCanvas };
})();

function scaleFor(width, height) {
  if (!(width > 0) || !(height > 0)) return 1;
  const scale = Math.min(targetWidth / width, maxEdge / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  return Math.max(scale, 0.01);
}

async function run({ bytes, mode, page }) {
  const { pdfjs, createCanvas } = await ready;
  const task = pdfjs.getDocument({
    data: bytes,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: assets.standardFonts,
    cMapUrl: assets.cmaps,
    cMapPacked: true,
    wasmUrl: assets.wasm,
    iccUrl: assets.iccs,
    maxImageSize: maxImagePixels,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    verbosity: 0,
  });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch {
      return { ok: false, reason: "unreadable" };
    }
    if (mode === "info") {
      const pages = [];
      for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
        const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
        pages.push({ width: Math.round(vp.width), height: Math.round(vp.height) });
      }
      return { ok: true, pages, total: doc.numPages };
    }
    if (!Number.isInteger(page) || page < 1 || page > Math.min(doc.numPages, maxPages)) {
      return { ok: false, reason: "page_out_of_range" };
    }
    const pdfPage = await doc.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: scaleFor(base.width, base.height) });
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // annotationMode 1 (ENABLE): annotations drawn as they print, never as
    // live widgets.
    await pdfPage.render({ canvas, canvasContext: ctx, viewport, annotationMode: 1 }).promise;
    // A plain copy (the canvas's buffer may live outside the JS heap and
    // can't be transferred).
    return { ok: true, png: new Uint8Array(await canvas.encode("png")) };
  } finally {
    // Frees the document's caches before the next job.
    await task.destroy().catch(() => {});
  }
}

parentPort.on("message", (job) => {
  run(job)
    .then((answer) => {
      const message = { id: job.id, ...answer };
      parentPort.postMessage(message, answer.png ? [answer.png.buffer] : []);
    })
    .catch(() => parentPort.postMessage({ id: job.id, ok: false, reason: "unreadable" }));
});
