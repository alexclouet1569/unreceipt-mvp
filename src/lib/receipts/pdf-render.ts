// SERVER-ONLY. A receipt's PDF original shown as pictures: each page
// rendered to a PNG on the server (pdf.js + @napi-rs/canvas), so the website
// and the iPhone app show the PDF without a PDF viewer. What a viewer could
// do and a picture can't: run the PDF's JavaScript (pdf.js runs none here:
// scripting belongs to its separate viewer, and this build has no `eval`),
// follow a link, submit a form, or fetch anything (pdf.js gets the bytes,
// never a URL; its fonts and decoders come from node_modules by fixed
// names). Both clients show only the PNG.
//
// pdf.js parses and draws synchronously, and a tiny file can describe hours
// of drawing (security review 2026-11-14: a 25 KB PDF blocked the thread
// for 18 s, a 120 KB one ran out of memory). So every PDF is opened in its
// own worker thread (pdf-render-worker.mjs) with a capped heap, killed when
// it runs past its time: a hostile file costs one worker, never the
// function or the other requests on its instance. Also bounded: at most
// MAX_PDF_PAGES pages, a page drawn at most MAX_EDGE_PX on its long side
// and MAX_PIXELS in all, embedded images up to MAX_IMAGE_PIXELS.

import path from "node:path";
import { Worker } from "node:worker_threads";
import { MAX_PDF_PAGES } from "./pdf-pages";

/** Width a page is drawn at (pinch-zoom room on a phone: ~4× a 390 pt screen). */
export const TARGET_WIDTH_PX = 1600;
const MAX_EDGE_PX = 6000;
const MAX_PIXELS = 1600 * 6000;
const MAX_IMAGE_PIXELS = 40_000_000;
/** Wall-clock budget of one worker, opening included (a real receipt takes well under 1 s). */
export const WORKER_TIMEOUT_MS = 8_000;
// pdf.js keeps part of its data in buffers outside the capped heap (a
// hostile page reached ~1 GB before it was stopped), so at most this many
// workers run at once on one instance; the others wait their turn.
const MAX_WORKERS = 2;
// A file that ran out of time or memory is refused at once for this long
// (per instance), instead of costing a worker on every retry.
const HEAVY_MEMO_MS = 30 * 60_000;
// The worker's JavaScript heap; the canvas's pixels (at most MAX_PIXELS × 4
// bytes) live outside it.
const WORKER_HEAP_MB = 256;

export type PdfPageSize = { width: number; height: number };

export class PdfPreviewError extends Error {
  constructor(readonly reason: "unreadable" | "page_out_of_range" | "timeout" | "too_heavy") {
    super(reason);
    this.name = "PdfPreviewError";
  }
}

// Read from disk by path at run time; next.config.ts (PDFJS_FILES) adds
// them to the routes' files.
function projectPath(...parts: string[]): string {
  return path.join(process.cwd(), ...parts);
}

function assetDir(name: string): string {
  return projectPath("node_modules", "pdfjs-dist", name) + path.sep;
}

type WorkerAnswer =
  | { ok: true; pages: PdfPageSize[]; total: number }
  | { ok: true; png: Uint8Array }
  | { ok: false; reason: "unreadable" | "page_out_of_range" };

let running = 0;
const waiting: (() => void)[] = [];

async function slot(): Promise<() => void> {
  if (running >= MAX_WORKERS) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  return () => {
    running--;
    waiting.shift()?.();
  };
}

const heavy = new Map<string, number>();

/** A file (by its storage key) that recently ran out of time or memory. */
export function knownHeavy(key: string): boolean {
  const until = heavy.get(key);
  if (until == null) return false;
  if (until > Date.now()) return true;
  heavy.delete(key);
  return false;
}

export function rememberHeavy(key: string): void {
  if (heavy.size > 500) heavy.clear();
  heavy.set(key, Date.now() + HEAVY_MEMO_MS);
}

async function runWorker(
  bytes: Uint8Array,
  job: { mode: "info" } | { mode: "render"; page: number },
  timeoutMs: number,
): Promise<WorkerAnswer> {
  const release = await slot();
  try {
    return await startWorker(bytes, job, timeoutMs);
  } finally {
    release();
  }
}

function startWorker(
  bytes: Uint8Array,
  job: { mode: "info" } | { mode: "render"; page: number },
  timeoutMs: number,
): Promise<WorkerAnswer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(projectPath("src", "lib", "receipts", "pdf-render-worker.mjs"), {
      workerData: {
        // A copy: the worker owns it.
        bytes: new Uint8Array(bytes),
        mode: job.mode,
        page: job.mode === "render" ? job.page : null,
        maxPages: MAX_PDF_PAGES,
        targetWidth: TARGET_WIDTH_PX,
        maxEdge: MAX_EDGE_PX,
        maxPixels: MAX_PIXELS,
        maxImagePixels: MAX_IMAGE_PIXELS,
        assets: {
          standardFonts: assetDir("standard_fonts"),
          cmaps: assetDir("cmaps"),
          wasm: assetDir("wasm"),
          iccs: assetDir("iccs"),
        },
      },
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB, maxYoungGenerationSizeMb: 32 },
      stdout: true,
      stderr: true,
    });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };
    // terminate() stops the worker even in the middle of a synchronous run.
    const timer = setTimeout(() => finish(() => reject(new PdfPreviewError("timeout"))), timeoutMs);
    worker.once("message", (answer: WorkerAnswer) => finish(() => resolve(answer)));
    worker.once("error", (err: Error & { code?: string }) =>
      finish(() =>
        reject(new PdfPreviewError(err.code === "ERR_WORKER_OUT_OF_MEMORY" ? "too_heavy" : "unreadable")),
      ),
    );
    worker.once("exit", () => finish(() => reject(new PdfPreviewError("unreadable"))));
  });
}

/** Pages shown (at most MAX_PDF_PAGES) with their sizes in PDF points, and the document's page count. */
export async function pdfPreviewInfo(
  bytes: Uint8Array,
  { timeoutMs = WORKER_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<{ pages: PdfPageSize[]; total: number }> {
  const answer = await runWorker(bytes, { mode: "info" }, timeoutMs);
  if (!answer.ok) throw new PdfPreviewError(answer.reason);
  if (!("pages" in answer)) throw new PdfPreviewError("unreadable");
  return { pages: answer.pages, total: answer.total };
}

/** The scale that draws a page TARGET_WIDTH_PX wide, within the pixel bounds (same formula as the worker). */
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
export async function renderPdfPage(
  bytes: Uint8Array,
  pageNumber: number,
  { timeoutMs = WORKER_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Buffer> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_PDF_PAGES) {
    throw new PdfPreviewError("page_out_of_range");
  }
  const answer = await runWorker(bytes, { mode: "render", page: pageNumber }, timeoutMs);
  if (!answer.ok) throw new PdfPreviewError(answer.reason);
  if (!("png" in answer)) throw new PdfPreviewError("unreadable");
  return Buffer.from(answer.png);
}
