"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Plus, RotateCcw } from "lucide-react";
import { prepareImageForUpload } from "@/lib/image-resize";
import { formatAmount } from "@/lib/receipt-format";
import { MAX_UPLOAD_BYTES } from "@/lib/receipts/upload-limits";

// "Several receipts at once": every photo, and every page of a scanned
// PDF, becomes its own receipt, read on the server (/api/capture/scan).
// Two at a time; each waits in Review needed, filled in, for a quick
// confirmation.

export const MAX_BATCH = 50;
const CONCURRENCY = 2;

type ItemState =
  | { kind: "waiting" }
  | { kind: "reading" }
  | { kind: "saved"; merchant: string | null; total: number | null; currency: string; missing: string | null; duplicate: boolean }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string };

type Item = { id: string; label: string; file: File; state: ItemState };

let seq = 0;
const nextId = () => `batch-${++seq}`;

/** Each PDF page as its own one-page PDF; photos as they are. */
export async function expandFiles(files: File[]): Promise<Array<{ label: string; file: File } | { label: string; error: string }>> {
  const out: Array<{ label: string; file: File } | { label: string; error: string }> = [];
  for (const file of files) {
    if (file.type !== "application/pdf") {
      out.push({ label: file.name || "Photo", file });
      continue;
    }
    try {
      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
      const pages = src.getPageCount();
      if (pages <= 1) {
        out.push({ label: file.name || "PDF", file });
        continue;
      }
      for (let i = 0; i < pages; i++) {
        const one = await PDFDocument.create();
        const [page] = await one.copyPages(src, [i]);
        one.addPage(page);
        const bytes = await one.save();
        const base = (file.name || "scan.pdf").replace(/\.pdf$/i, "");
        out.push({
          label: `${file.name || "Scan"}, page ${i + 1}`,
          file: new File([bytes as BlobPart], `${base}-page-${i + 1}.pdf`, { type: "application/pdf" }),
        });
      }
    } catch {
      out.push({ label: file.name || "PDF", error: "This PDF couldn't be opened." });
    }
  }
  return out;
}

export function BatchCapture({ initialFiles, onDone }: { initialFiles: File[]; onDone: () => void }) {
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
    const added: Item[] = expanded.slice(0, room).map((e) =>
      "error" in e
        ? { id: nextId(), label: e.label, file: new File([], e.label), state: { kind: "failed", reason: e.error } }
        : { id: nextId(), label: e.label, file: e.file, state: { kind: "waiting" } }
    );
    if (expanded.length > room) setNotice(`Up to ${MAX_BATCH} at a time: send the rest after these.`);
    commit([...itemsRef.current, ...added]);
    setPreparing(false);
    pump();
  }

  // Once, with the files the sheet was opened with.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
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
    { waiting: 0, reading: 0, saved: 0, skipped: 0, failed: 0, toComplete: 0 }
  );
  // While paused, waiting files aren't being read: not busy.
  const busy = preparing || counts.reading > 0 || (counts.waiting > 0 && !paused);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setPreparing(true);
    void add(files);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-1 pb-3" role="status" aria-live="polite">
        <p className="text-[15px] font-bold text-[var(--ink)]">
          {busy
            ? `Reading ${counts.saved + counts.skipped + counts.failed + 1 > items.length ? items.length : counts.saved + counts.skipped + counts.failed + 1} of ${items.length || "…"}`
            : `${counts.saved} receipt${counts.saved === 1 ? "" : "s"} saved`}
        </p>
        <p className="text-[13px] font-medium text-[var(--ink-muted)]">
          {busy
            ? "Keep this open until every receipt is read. Each one then waits under Review needed for a quick check."
            : counts.toComplete > 0
              ? `${counts.toComplete} still ${counts.toComplete === 1 ? "misses" : "miss"} a field (in red). The others only need a quick confirmation under Review needed.`
              : "Each one waits under Review needed: compare it with the photo and confirm."}
        </p>
        {paused || notice ? (
          <p className="mt-1 text-[13px] font-semibold text-[var(--attention-deep)]">{paused ?? notice}</p>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-[var(--hairline)] overflow-y-auto border-y border-[var(--hairline)]">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 px-4 py-3" data-testid="batch-item">
            <span className="flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
              {it.state.kind === "reading" ? (
                <Loader2 className="size-4 animate-spin text-[var(--ink-muted)]" />
              ) : it.state.kind === "saved" ? (
                <Check className="size-4 text-[var(--brand-action)]" strokeWidth={3} />
              ) : it.state.kind === "waiting" ? (
                <span className="size-2 rounded-full bg-[var(--hairline)]" />
              ) : (
                <span className="size-2 rounded-full bg-[var(--attention)]" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {it.state.kind === "saved" ? (
                <>
                  <p className="truncate text-[15px] font-bold text-[var(--ink)]">
                    {it.state.merchant ?? "Receipt"}
                  </p>
                  <p className="truncate text-[13px] font-medium">
                    {it.state.missing ? (
                      <span className="font-semibold text-[var(--negative)]">Missing {it.state.missing}</span>
                    ) : (
                      <span className="text-[var(--attention-deep)] font-semibold">To confirm</span>
                    )}
                    {it.state.duplicate ? (
                      <span className="text-[var(--ink-muted)]"> · maybe a duplicate</span>
                    ) : null}
                  </p>
                </>
              ) : (
                <>
                  <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{it.label}</p>
                  <p className="truncate text-[13px] font-medium text-[var(--ink-muted)]">
                    {it.state.kind === "waiting"
                      ? "Waiting"
                      : it.state.kind === "reading"
                        ? "Reading…"
                        : it.state.reason}
                  </p>
                </>
              )}
            </div>
            {it.state.kind === "saved" && it.state.total != null ? (
              <span className="shrink-0 font-mono text-[15px] font-medium tabular-nums text-[var(--ink)]">
                {formatAmount(it.state.total, it.state.currency)}
              </span>
            ) : null}
          </li>
        ))}
        {preparing ? (
          <li className="flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-[var(--ink-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Opening the files…
          </li>
        ) : null}
      </ul>

      <div className="grid gap-3 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
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

const PRIMARY =
  "flex h-[54px] w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-[16px] font-bold text-primary-foreground outline-none transition-colors hover:bg-[var(--brand-action-deep)] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

const SECONDARY =
  "flex h-[54px] w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--hairline)] bg-card text-[16px] font-bold text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
