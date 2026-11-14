// pdf.js ships no types for its worker module; src/lib/receipts/pdf-render.ts
// only hands it to pdf.js (globalThis.pdfjsWorker) in Node.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
