"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Plus, RotateCcw } from "lucide-react";
import { prepareImageForUpload } from "@/lib/image-resize";
import { formatAmount } from "@/lib/receipt-format";
import { MAX_UPLOAD_BYTES } from "@/lib/receipts/upload-limits";
import { MAX_PDF_PAGES } from "@/lib/receipts/pdf-pages";
import { canSplit, inspectPdf } from "@/lib/receipts/pdf-inspect";

// "Several receipts at once": every photo becomes its own receipt, read on
// the server (/api/capture/scan), two at a time; each waits in Review
// needed, filled in, for a quick confirmation.
//
// A multi-page PDF asks first: each page is a receipt (a scanned stack),
// or the whole file is one receipt (a long invoice). Split, the file is
// stored whole first (/api/capture/scan/original) and every page's receipt
// points at it as its original, so nothing in it is lost. Encrypted PDFs
// and e-invoices carrying files are always read whole
// (src/lib/receipts/pdf-inspect.ts).

export const MAX_BATCH = 50;
const CONCURRENCY = 2;

type Saved = { kind: "saved"; merchant: string | null; total: number | null; currency: string; missing: string | null; duplicate: boolean };
type ItemState =
  | { kind: "choose"; pages: number }
  | { kind: "waiting" }
  | { kind: "reading" }
  | Saved
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string };

type Mode = { as: "file" } | { as: "whole" } | { as: "page"; scan: string; page: number; pages: number };
type Item = { id: string; label: string; file: File; mode: Mode; state: ItemState };

let seq = 0;
const nextId = () => `batch-${++seq}`;

export type Expanded =
  | { label: string; file: File; mode: Mode; choose?: undefined }
  | { label: string; file: File; choose: number }
  | { label: string; error: string };

/** What each picked file becomes: a photo or one-page PDF, a whole PDF, or a choice. */
export async function expandFiles(files: File[]): Promise<Expanded[]> {
  const out: Expanded[] = [];
  for (const file of files) {
    const label = file.name || (file.type === "application/pdf" ? "PDF" : "Photo");
    if (file.type !== "application/pdf") {
      out.push({ label, file, mode: { as: "file" } });
      continue;
    }
    const shape = await inspectPdf(new Uint8Array(await file.arrayBuffer()));
    if (!shape) {
      out.push({ label, error: "This PDF couldn't be opened." });
    } else if (shape.pages <= 1) {
      out.push({ label, file, mode: { as: "file" } });
    } else if (canSplit(shape)) {
      out.push({ label, file, choose: shape.pages });
    } else if (shape.pages <= MAX_PDF_PAGES) {
      out.push({ label: `${label} (read as one receipt)`, file, mode: { as: "whole" } });
    } else {
      out.push({ label, error: `This PDF can only be read whole, and it has more than ${MAX_PDF_PAGES} pages.` });
    }
  }
  return out;
}

/** One-page PDFs, one per page of `file`. */
export async function splitPages(file: File): Promise<File[]> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
  const base = (file.name || "scan.pdf").replace(/\.pdf$/i, "");
  const pages: File[] = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const one = await PDFDocument.create();
    const [page] = await one.copyPages(src, [i]);
    one.addPage(page);
    pages.push(new File([(await one.save()) as BlobPart], `${base}-page-${i + 1}.pdf`, { type: "application/pdf" }));
  }
  return pages;
}

export function BatchCapture({
  initialFiles,
  onDone,
  onBusyChange,
}: {
  initialFiles: File[];
  onDone: () => void;
  // The sheet asks before closing while this is true.
  onBusyChange?: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [preparing, setPreparing] = useState(true);
  // Paused after the rate limit: nothing more is sent until Try again.
  const [paused, setPaused] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The queue's own truth, read by the pump; `items` mirrors it for render.
  const itemsRef = useRef<Item[]>([]);
  const stoppedRef = useRef(false);
  const running = useRef(0);
  // Ids already handed to send(), so a pump pass never starts one twice.
  const started = useRef(new Set<string>());
  const statusRef = useRef<HTMLParagraphElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function commit(next: Item[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function update(id: string, state: ItemState) {
    commit(itemsRef.current.map((it) => (it.id === id ? { ...it, state } : it)));
  }

  function stop(message: string) {
    stoppedRef.current = true;
    setPaused(message);
  }

  async function send(item: Item) {
    update(item.id, { kind: "reading" });
    try {
      let file = item.file;
      if (file.type.startsWith("image/")) file = await prepareImageForUpload(file);
      if (file.size > MAX_UPLOAD_BYTES) {
        update(item.id, { kind: "failed", reason: "Larger than 4 MB." });
        return;
      }
      const form = new FormData();
      form.append("file", file);
      if (item.mode.as === "whole") form.append("whole", "1");
      if (item.mode.as === "page") {
        form.append("scan", item.mode.scan);
        form.append("page", String(item.mode.page));
        form.append("pages", String(item.mode.pages));
      }
      const res = await fetch("/api/capture/scan", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 429) {
        stop("That's a lot at once. Wait a few minutes, then press Try again.");
        update(item.id, { kind: "failed", reason: "Paused: too many at once." });
        return;
      }
      if (!res.ok) {
        update(item.id, { kind: "failed", reason: typeof body.error === "string" ? body.error : "Couldn't save it." });
        return;
      }
      if (body.skipped) {
        update(item.id, { kind: "skipped", reason: typeof body.reason === "string" ? body.reason : "Not a receipt." });
        return;
      }
      update(item.id, {
        kind: "saved",
        merchant: typeof body.merchant === "string" ? body.merchant : null,
        total: typeof body.total === "number" ? body.total : null,
        currency: typeof body.currency === "string" ? body.currency : "SEK",
        missing: typeof body.missing === "string" ? body.missing : null,
        duplicate: body.duplicate === true,
      });
    } catch {
      update(item.id, { kind: "failed", reason: "No connection. Try again." });
    }
  }

  // Starts waiting items while fewer than CONCURRENCY are being read.
  function pump() {
    if (stoppedRef.current) return;
    for (const item of itemsRef.current) {
      if (running.current >= CONCURRENCY) break;
      if (item.state.kind !== "waiting" || started.current.has(item.id)) continue;
      running.current++;
      started.current.add(item.id);
      void send(item).finally(() => {
        running.current--;
        pump();
      });
    }
  }

  async function add(files: File[]) {
    const expanded = await expandFiles(files);
    const room = Math.max(0, MAX_BATCH - itemsRef.current.length);
    const added: Item[] = expanded.slice(0, room).map((e): Item => {
      if ("error" in e) return { id: nextId(), label: e.label, file: new File([], e.label), mode: { as: "file" }, state: { kind: "failed", reason: e.error } };
      if (e.choose !== undefined) return { id: nextId(), label: e.label, file: e.file, mode: { as: "file" }, state: { kind: "choose", pages: e.choose } };
      return { id: nextId(), label: e.label, file: e.file, mode: e.mode, state: { kind: "waiting" } };
    });
    if (expanded.length > room) setNotice(`Up to ${MAX_BATCH} at a time: send the rest after these.`);
    commit([...itemsRef.current, ...added]);
    setPreparing(false);
    pump();
  }

  // A multi-page PDF: each page a receipt (the file is stored whole first)
  // or the whole file one receipt.
  async function choose(item: Item, each: boolean) {
    if (!each) {
      if (item.state.kind === "choose" && item.state.pages > MAX_PDF_PAGES) {
        update(item.id, { kind: "failed", reason: `Up to ${MAX_PDF_PAGES} pages can be read as one receipt.` });
        return;
      }
      commit(itemsRef.current.map((it) => (it.id === item.id ? { ...it, mode: { as: "whole" }, state: { kind: "waiting" } } : it)));
      pump();
      return;
    }
    update(item.id, { kind: "reading" });
    try {
      const form = new FormData();
      form.append("file", item.file);
      const res = await fetch("/api/capture/scan/original", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { scan?: string; pages?: number; error?: string };
      if (!res.ok || !body.scan || !body.pages) {
        update(item.id, { kind: "failed", reason: body.error ?? "Couldn't store the scan. Try again." });
        return;
      }
      const pages = await splitPages(item.file);
      const room = Math.max(0, MAX_BATCH - itemsRef.current.length + 1);
      const pageItems: Item[] = pages.slice(0, room).map((file, i) => ({
        id: nextId(),
        label: `${item.label}, page ${i + 1}`,
        file,
        mode: { as: "page", scan: body.scan as string, page: i + 1, pages: body.pages as number },
        state: { kind: "waiting" },
      }));
      if (pages.length > room) setNotice(`Up to ${MAX_BATCH} at a time: the last pages weren't read. The whole scan is kept.`);
      commit(itemsRef.current.flatMap((it) => (it.id === item.id ? pageItems : [it])));
      pump();
    } catch {
      update(item.id, { kind: "failed", reason: "Couldn't open the pages. Try again." });
    }
  }

  // Once, with the files the sheet was opened with; focus lands on the
  // status line (the button that opened this is gone).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    statusRef.current?.focus();
    void add(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    stoppedRef.current = false;
    setPaused(null);
    commit(
      itemsRef.current.map((it) => {
        if (it.state.kind !== "failed" || it.file.size === 0) return it;
        started.current.delete(it.id);
        return { ...it, state: { kind: "waiting" as const } };
      })
    );
    pump();
  };

  const counts = items.reduce(
    (c, it) => {
      c[it.state.kind]++;
      if (it.state.kind === "saved" && it.state.missing) c.toComplete++;
      return c;
    },
    { choose: 0, waiting: 0, reading: 0, saved: 0, skipped: 0, failed: 0, toComplete: 0 }
  );
  // While paused, waiting files aren't being read: not busy.
  const busy = preparing || counts.reading > 0 || (counts.waiting > 0 && !paused);
  const done = counts.saved + counts.skipped + counts.failed;
  const total = items.length - counts.choose;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setPreparing(true);
    void add(files);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="max-h-[40%] shrink-0 overflow-y-auto px-4 pt-1 pb-3">
        <p ref={statusRef} tabIndex={-1} role="status" className="text-[15px] font-bold text-[var(--ink)] outline-none">
          {items.length === 0
            ? "Opening the files…"
            : busy
              ? `Reading ${Math.min(done + 1, total)} of ${total}`
              : counts.choose > 0 && total === 0
                ? "One question first"
                : `${counts.saved} receipt${counts.saved === 1 ? "" : "s"} saved`}
        </p>
        <p className="text-[13px] font-medium text-[var(--ink-muted)]">
          {busy
            ? "Keep this open until every receipt is read. Each one then waits under Review needed for a quick check."
            : counts.toComplete > 0
              ? `${counts.toComplete} still ${counts.toComplete === 1 ? "misses" : "miss"} a field (in red). The others only need a quick confirmation under Review needed.`
              : "Each one waits under Review needed: compare it with the photo and confirm."}
          {" "}A scanned PDF is kept whole, as the original of its receipts.
        </p>
        <div role="status">
          {paused || notice ? (
            <p className="mt-1 text-[13px] font-semibold text-[var(--attention-deep)]">{paused ?? notice}</p>
          ) : null}
        </div>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-[var(--hairline)] overflow-y-auto border-y border-[var(--hairline)]">
        {items.map((it) => (
          <li key={it.id} className="px-4 py-3" data-testid="batch-item">
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
                {it.state.kind === "reading" ? (
                  <Loader2 className="size-4 animate-spin text-[var(--ink-muted)]" />
                ) : it.state.kind === "saved" ? (
                  <Check className="size-4 text-[var(--brand-action)]" strokeWidth={3} />
                ) : it.state.kind === "waiting" || it.state.kind === "choose" ? (
                  <span className="size-2 rounded-full bg-[var(--hairline)]" />
                ) : (
                  <span className="size-2 rounded-full bg-[var(--attention)]" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {it.state.kind === "saved" ? (
                  <>
                    <p className="truncate text-[15px] font-bold text-[var(--ink)]">{it.state.merchant ?? "Receipt"}</p>
                    <p className="truncate text-[13px] font-medium">
                      {it.state.missing ? (
                        <span className="font-semibold text-[var(--negative)]">Missing {it.state.missing}</span>
                      ) : (
                        <span className="font-semibold text-[var(--attention-deep)]">To confirm</span>
                      )}
                      {it.state.duplicate ? <span className="text-[var(--ink-muted)]"> · possible duplicate</span> : null}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{it.label}</p>
                    <p className="text-[13px] font-medium text-[var(--ink-muted)]">
                      {it.state.kind === "waiting"
                        ? "Waiting"
                        : it.state.kind === "reading"
                          ? "Reading…"
                          : it.state.kind === "choose"
                            ? `${it.state.pages} pages. Is each page a receipt, or is the file one receipt?`
                            : it.state.reason}
                    </p>
                  </>
                )}
              </div>
              {it.state.kind === "saved" && it.state.total != null ? (
                <span className="shrink-0 font-mono text-[14px] font-normal tabular-nums text-[var(--ink)]">
                  {formatAmount(it.state.total, it.state.currency)}
                </span>
              ) : null}
            </div>
            {it.state.kind === "choose" ? (
              <div className="mt-2 grid grid-cols-2 gap-2 pl-11">
                <button type="button" onClick={() => void choose(it, true)} className={SMALL}>
                  Each page is a receipt
                </button>
                <button type="button" onClick={() => void choose(it, false)} className={SMALL}>
                  One receipt
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="grid shrink-0 gap-3 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {(counts.failed > 0 || paused) && !busy ? (
          <button type="button" onClick={retry} className={SECONDARY}>
            <RotateCcw className="size-5" aria-hidden="true" />
            Try again ({counts.failed + (paused ? counts.waiting : 0)})
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => cameraRef.current?.click()} className={SECONDARY}>
            <Camera className="size-5" aria-hidden="true" />
            Photo
          </button>
          <button type="button" onClick={() => libraryRef.current?.click()} className={SECONDARY}>
            <Plus className="size-5" aria-hidden="true" />
            Add more
          </button>
        </div>
        <button type="button" onClick={onDone} className={PRIMARY} disabled={busy}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
          {busy ? "Reading…" : "Done"}
        </button>
      </div>

      <input ref={libraryRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPick} tabIndex={-1} aria-hidden="true" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} tabIndex={-1} aria-hidden="true" />
    </div>
  );
}

// Same as the capture sheet's buttons (CaptureDialog.tsx).
const PRIMARY =
  "flex h-[54px] w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-[16px] font-bold text-primary-foreground outline-none transition-colors hover:bg-[var(--brand-action-deep)] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

const SECONDARY =
  "flex h-[54px] w-full items-center justify-center gap-3 rounded-[10px] border border-[var(--hairline)] bg-card text-[16px] font-bold text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const SMALL =
  "flex min-h-11 items-center justify-center rounded-[10px] border border-[var(--hairline)] bg-card px-3 text-[14px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
