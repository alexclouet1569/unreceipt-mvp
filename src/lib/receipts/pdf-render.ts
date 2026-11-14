// SERVER-ONLY. A receipt's PDF original shown as pictures: each page
// rendered to a PNG on the server (pdf.js + @napi-rs/canvas), so the website
// and the iPhone app show the PDF without a PDF viewer. What a viewer could
// do and a picture can't: run the PDF's JavaScript (pdf.js runs none here:
// scripting belongs to its separate viewer, and this build has no `eval`),
// follow a link, submit a form, or fetch anything (pdf.js gets the bytes,
// never a URL; its fonts and decoders come from node_modules by fixed
// names). Both clients show only the PNG.
//
// pdf.js parses and draws synchronously, and a tiny file can describe
// minutes of drawing or gigabytes of image data (security review
// 2026-11-14: a 25 KB PDF blocked the thread for 18 s, a 120 KB one ran
// out of memory, a 1.3 MB one with twelve huge images reached 2.8 GB). So
// PDFs are opened in one worker thread (pdf-render-worker.mjs), one job at
// a time, with a capped heap; the job is killed (and the thread replaced)
// when it runs past WORKER_TIMEOUT_MS or the process's memory grows past
// the budget (decoded images live outside the heap cap, so the parent
// watches the whole process), and at most MAX_QUEUED jobs wait. A hostile
// file costs one job, never the function or the other requests on its
// instance. Also bounded: at most MAX_PDF_PAGES pages, a page drawn at most
// MAX_EDGE_PX on its long side and MAX_PIXELS in all, embedded images up to
// MAX_IMAGE_PIXELS each.

import path from "node:path";
import { Worker } from "node:worker_threads";
import { MAX_PDF_PAGES } from "./pdf-pages";

/** Width a page is drawn at (pinch-zoom room on a phone: ~4× a 390 pt screen). */
export const TARGET_WIDTH_PX = 1600;
const MAX_EDGE_PX = 6000;
const MAX_PIXELS = 1600 * 6000;
// An A4 scan at 300 dpi is ~8.7 Mpx.
const MAX_IMAGE_PIXELS = 16_000_000;
/** Wall-clock budget of one job, opening included (a real receipt takes well under 1 s). */
export const WORKER_TIMEOUT_MS = 8_000;
// The worker's JavaScript heap.
const WORKER_HEAP_MB = 256;
// Memory the process may grow by during one job, and the most it may use
// at all (Vercel's functions have 2 GB). Checked every WATCH_MS.
const JOB_MEMORY_MB = 400;
const PROCESS_MEMORY_MB = 1300;
const WATCH_MS = 25;
// Jobs waiting for the worker, and how long one may wait.
const MAX_QUEUED = 4;
const QUEUE_WAIT_MS = 5_000;
// A file that ran out of time or memory is refused at once for this long
// (per instance), instead of costing a job on every retry.
const HEAVY_MEMO_MS = 30 * 60_000;

export type PdfPageSize = { width: number; height: number };

export class PdfPreviewError extends Error {
  constructor(readonly reason: "unreadable" | "page_out_of_range" | "timeout" | "too_heavy" | "busy") {
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

type Job = { mode: "info" } | { mode: "render"; page: number };

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

let worker: Worker | null = null;

function freshWorker(): Worker {
  const w = new Worker(projectPath("src", "lib", "receipts", "pdf-render-worker.mjs"), {
    workerData: {
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
  // An idle worker doesn't keep the function alive.
  w.unref();
  return w;
}

function killWorker(): void {
  const w = worker;
  worker = null;
  if (w) void w.terminate();
}

const rssMb = () => process.memoryUsage.rss() / (1024 * 1024);

let busy = false;
let nextId = 1;
const queue: (() => void)[] = [];

async function turn(): Promise<() => void> {
  if (busy) {
    if (queue.length >= MAX_QUEUED) throw new PdfPreviewError("busy");
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const i = queue.indexOf(go);
        if (i !== -1) queue.splice(i, 1);
        reject(new PdfPreviewError("busy"));
      }, QUEUE_WAIT_MS);
      queue.push(go);
    });
  }
  busy = true;
  return () => {
    busy = false;
    const next = queue.shift();
    if (next) {
      busy = true;
      next();
    }
  };
}

function runJob(bytes: Uint8Array, job: Job, timeoutMs: number): Promise<WorkerAnswer> {
  return new Promise((resolve, reject) => {
    const startRss = rssMb();
    if (startRss > PROCESS_MEMORY_MB) {
      reject(new PdfPreviewError("busy"));
      return;
    }
    const w = (worker ??= freshWorker());
    const id = nextId++;
    let settled = false;
    const finish = (fn: () => void, kill: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(watch);
      w.off("message", onMessage);
      w.off("error", onError);
      w.off("exit", onExit);
      if (kill && worker === w) killWorker();
      fn();
    };
    const onMessage = (answer: WorkerAnswer & { id: number }) => {
      if (answer.id !== id) return;
      finish(() => resolve(answer), false);
    };
    const onError = (err: Error & { code?: string }) =>
      finish(
        () => reject(new PdfPreviewError(err.code === "ERR_WORKER_OUT_OF_MEMORY" ? "too_heavy" : "unreadable")),
        true,
      );
    const onExit = () => finish(() => reject(new PdfPreviewError("unreadable")), true);
    // terminate() stops the worker even in the middle of a synchronous run.
    const timer = setTimeout(() => finish(() => reject(new PdfPreviewError("timeout")), true), timeoutMs);
    const watch = setInterval(() => {
      const now = rssMb();
      if (now > startRss + JOB_MEMORY_MB || now > PROCESS_MEMORY_MB) {
        finish(() => reject(new PdfPreviewError("too_heavy")), true);
      }
    }, WATCH_MS);
    w.on("message", onMessage);
    w.once("error", onError);
    w.once("exit", onExit);
    // A copy: the worker owns it.
    const data = new Uint8Array(bytes);
    w.postMessage({ id, bytes: data, mode: job.mode, page: job.mode === "render" ? job.page : null }, [data.buffer]);
  });
}

async function runWorker(bytes: Uint8Array, job: Job, timeoutMs: number): Promise<WorkerAnswer> {
  const done = await turn();
  try {
    return await runJob(bytes, job, timeoutMs);
  } finally {
    done();
  }
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
