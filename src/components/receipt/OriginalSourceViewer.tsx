"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "@/components/receipt/PhotoViewer";
import type { OriginalPreview, ReceiptOriginal } from "@/lib/mobile/types";

// The receipt's original, shown in the "Original" tab of the receipt sheet
// (owner and firm alike; the server applies who may see it). Nothing here
// renders the file itself: a photo is the picture, a PDF is one picture per
// page drawn by the server (no PDF viewer: no PDF JavaScript, links or
// forms), an email or text message is plain text the server cut from it
// (no HTML: no scripts, tracking pixels or remote images). Tap a photo or a
// page to see it full screen and zoom. "Download original" saves the file
// as it was received.

type FetchState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ok"; payload: ReceiptOriginal };

type OriginalSourceViewerProps = {
  receiptId: string;
  smsFromHint?: string | null;
};

export function OriginalSourceViewer({
  receiptId,
  smsFromHint,
}: OriginalSourceViewerProps) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/receipts/${receiptId}/original?preview=1`, {
          cache: "no-store",
        });
        if (cancelled) return;

        if (res.status === 404) {
          const body = await res.json().catch(() => ({}));
          if (body?.error === "no_original") {
            setState({ kind: "missing" });
            return;
          }
          setState({ kind: "error", message: "Receipt not found." });
          return;
        }

        if (!res.ok) {
          setState({
            kind: "error",
            message:
              res.status === 429
                ? "Too many originals opened at once. Try again in a minute."
                : `Couldn't load the original (${res.status}).`,
          });
          return;
        }

        const payload = (await res.json()) as ReceiptOriginal;
        setState({ kind: "ok", payload });
      } catch {
        if (cancelled) return;
        setState({ kind: "error", message: "Couldn't load the original. Check your connection." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [receiptId, reloadKey]);

  if (state.kind === "loading") {
    return (
      <div
        className="flex items-center justify-center gap-2 py-12 text-[var(--ink-muted)]"
        data-testid="original-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading original…</span>
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div
        className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]"
        data-testid="original-missing"
      >
        We didn&rsquo;t store an original for this receipt.
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="px-4 py-10 text-center space-y-3">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setState({ kind: "loading" });
            setReloadKey((k) => k + 1);
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const { url, downloadUrl, kind, filename, preview } = state.payload;

  return (
    <div className="px-4 py-4 space-y-3" data-testid="original-viewer">
      <ArtifactBody
        receiptId={receiptId}
        kind={kind}
        url={url}
        preview={preview}
        smsFromHint={smsFromHint}
      />
      <a
        href={downloadUrl ?? url}
        download={filename}
        className="flex w-full items-center justify-center gap-1.5 h-11 rounded-md border bg-background px-3 text-sm font-semibold hover:bg-accent hover:text-accent-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        Download original
      </a>
    </div>
  );
}

// Tap the photo to open it full screen and zoom in. No delete here: the
// original is the receipt's evidence.
function ZoomableOriginal({ url, alt, title }: { url: string; alt: string; title: string }) {
  const [viewing, setViewing] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setViewing(true)}
        aria-label={`${alt}: view full screen`}
        className="block w-full rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="w-full max-h-[60vh] object-contain rounded-md bg-[var(--background)]"
        />
      </button>
      <PhotoViewer open={viewing} onOpenChange={setViewing} src={url} alt={alt} title={title} />
    </>
  );
}

/** A PDF as pictures, one per page, each drawn by the server. */
function PdfPages({
  receiptId,
  preview,
}: {
  receiptId: string;
  preview: Extract<OriginalPreview, { type: "pdf" }>;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const count = preview.pages.length;
  const src = (n: number) => preview.images?.[n - 1] ?? `/api/receipts/${receiptId}/original/page/${n}`;
  return (
    <div className="space-y-3" data-testid="original-pdf">
      {preview.pages.map((page, i) => {
        const n = i + 1;
        const label = count > 1 ? `Page ${n} of ${preview.total}` : "Original PDF";
        return (
          <button
            key={n}
            type="button"
            onClick={() => setViewing(n)}
            aria-label={`${label}: view full screen`}
            className="block w-full overflow-hidden rounded-md border border-[var(--hairline)] bg-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{ aspectRatio: `${page.width} / ${page.height}` }}
          >
            {/* The page is a picture of a document: it stays on white in
                dark mode, like the receipt PDF (DESIGN.md). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(n)} alt={label} loading={i === 0 ? "eager" : "lazy"} className="block h-full w-full" />
          </button>
        );
      })}
      {preview.total > count ? (
        <p className="text-[13px] text-[var(--ink-muted)]">
          The first {count} of {preview.total} pages are shown. Download the original to see them all.
        </p>
      ) : null}
      {viewing != null ? (
        <PhotoViewer
          open
          onOpenChange={(open) => !open && setViewing(null)}
          src={src(viewing)}
          alt={`Page ${viewing} of the original`}
          title={count > 1 ? `Page ${viewing} of ${preview.total}` : "Original"}
        />
      ) : null}
    </div>
  );
}

function formatEmailDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Unavailable({ what }: { what: string }) {
  return (
    <p className="rounded-md border border-[var(--hairline)] bg-card px-3 py-6 text-center text-sm text-[var(--ink-muted)]">
      {what} can&rsquo;t be shown here. Download the original to see it.
    </p>
  );
}

function ArtifactBody({
  receiptId,
  kind,
  url,
  preview,
  smsFromHint,
}: {
  receiptId: string;
  kind: ReceiptOriginal["kind"];
  url: string;
  preview: OriginalPreview | undefined;
  smsFromHint?: string | null;
}) {
  if (kind === "image/jpeg" || kind === "image/png" || kind === "image/webp") {
    return <ZoomableOriginal url={url} alt="Original receipt" title="Original" />;
  }

  if (kind === "application/pdf") {
    if (preview?.type !== "pdf" || preview.pages.length === 0) return <Unavailable what="This PDF" />;
    return <PdfPages receiptId={receiptId} preview={preview} />;
  }

  if (kind === "eml") {
    if (preview?.type !== "eml") return <Unavailable what="This email" />;
    const date = formatEmailDate(preview.date);
    return (
      <div className="rounded-md border border-[var(--hairline)] bg-card overflow-hidden" data-testid="original-email">
        <dl className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-[var(--hairline)] text-[13px]">
          {(
            [
              ["From", preview.from],
              ["Subject", preview.subject],
              ["Date", date],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <div key={label} className="contents">
                <dt className="font-semibold text-[var(--ink-muted)]">{label}</dt>
                <dd className="text-[var(--ink)] break-words">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
        <div className="px-3 py-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words text-[var(--ink)] max-h-[60vh] overflow-y-auto">
          {preview.text || "This email has no text."}
        </div>
        {preview.truncated ? (
          <p className="px-3 pb-3 text-[13px] text-[var(--ink-muted)]">
            The email is longer than shown here. Download the original to read all of it.
          </p>
        ) : null}
      </div>
    );
  }

  if (kind === "txt") {
    const txt = preview?.type === "txt" ? preview.body : "";
    return (
      <div className="space-y-2">
        {smsFromHint ? (
          <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ink-muted)]">
            From {smsFromHint}
          </p>
        ) : null}
        <div className="rounded-md border border-[var(--hairline)] bg-card px-3 py-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words text-[var(--ink)]">
          {txt || "This message has no text."}
        </div>
      </div>
    );
  }

  return <Unavailable what="This original" />;
}
