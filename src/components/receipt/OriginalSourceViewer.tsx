"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "@/components/receipt/PhotoViewer";
import type { OriginalPreview, ReceiptOriginal } from "@/lib/mobile/types";

// The receipt's original, shown in the "Original" tab of the receipt sheet
// (owner and firm alike; the server applies who may see it). Nothing here
// renders the file itself: a photo is the picture, a PDF is one picture per
// page drawn by the server (no PDF viewer: no PDF JavaScript, links or
// forms), an email or text message is plain text the server cut from it
// (no HTML: no scripts, tracking pixels or remote images). Tap a photo or a
// page to see it full screen and zoom. A PDF, email or text message is a
// readable copy and says so: the file itself is the evidence, and
// "Download original" saves it as it was received (DESIGN.md "Original tab").

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
              res.status === 429 || res.status === 503
                ? "Too many originals opened at once. Try again in a moment."
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
    // The shape of what's coming, never a spinner on an empty tab.
    return (
      <div className="px-4 py-4 space-y-3" data-testid="original-loading" aria-busy="true">
        <span className="sr-only">Loading original…</span>
        <div className="h-[50vh] rounded-md bg-[var(--skeleton)] animate-pulse" />
        <div className="h-11 rounded-md bg-[var(--skeleton)] animate-pulse" />
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div
        className="px-4 py-10 text-center type-body text-[var(--ink-muted)]"
        data-testid="original-missing"
      >
        We didn&rsquo;t store an original for this receipt.
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="px-4 py-10 text-center space-y-3">
        <p className="type-body font-semibold text-[var(--attention-deep)]">{state.message}</p>
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-1.5"
          onClick={() => {
            setState({ kind: "loading" });
            setReloadKey((k) => k + 1);
          }}
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
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
        className="flex w-full items-center justify-center gap-1.5 h-11 rounded-md border bg-background px-3 type-body font-semibold hover:bg-accent hover:text-accent-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        Download original
      </a>
    </div>
  );
}

/** Under a PDF, email or text message: the view is a copy, the file is the original. */
function CopyNote({ children }: { children: React.ReactNode }) {
  return <p className="type-caption text-[var(--ink-muted)]">{children}</p>;
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

// The server answers 503 when its PDF worker is taken: try again twice.
function PageImage({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const url = attempt === 0 || src.startsWith("blob:") ? src : `${src}?try=${attempt}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      className="block h-full w-full"
      onError={() => {
        if (attempt < 2) setTimeout(() => setAttempt((a) => a + 1), 3000);
      }}
    />
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
            className="block w-full overflow-hidden rounded-md border border-[var(--hairline)] bg-[var(--paper)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{ aspectRatio: `${page.width} / ${page.height}` }}
          >
            <PageImage src={src(n)} alt={label} eager={i === 0} />
          </button>
        );
      })}
      <CopyNote>
        {preview.total > count
          ? `Pictures of the first ${count} of ${preview.total} pages. The PDF file itself is the original: download it to see every page.`
          : "Pictures of the PDF's pages. The PDF file itself is the original."}
      </CopyNote>
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

function Unavailable({ what }: { what: string }) {
  return (
    <p className="rounded-md border border-[var(--hairline)] bg-card px-3 py-6 text-center type-body text-[var(--ink-muted)]">
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
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-[var(--hairline)] bg-card" data-testid="original-email">
          <dl className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-[var(--hairline)] type-caption">
            {(
              [
                ["From", preview.from],
                ["To", preview.to],
                ["Subject", preview.subject],
                ["Date", preview.date],
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
          <div className="px-3 py-3 type-body whitespace-pre-wrap break-words text-[var(--ink)]">
            {preview.text || "This email has no text."}
          </div>
        </div>
        <CopyNote>
          {preview.truncated
            ? "A readable copy of the email, shortened: it is longer than shown here. The email file itself is the original: download it to read all of it."
            : "A readable copy of the email (its text, without images or links). The email file itself is the original."}
        </CopyNote>
      </div>
    );
  }

  if (kind === "txt") {
    const txt = preview?.type === "txt" ? preview : null;
    return (
      <div className="space-y-2">
        {smsFromHint ? (
          <p className="type-micro text-[var(--ink-muted)]">From {smsFromHint}</p>
        ) : null}
        <div className="rounded-md border border-[var(--hairline)] bg-card px-3 py-3 type-body whitespace-pre-wrap break-words text-[var(--ink)]">
          {txt?.body || "This message has no text."}
        </div>
        <CopyNote>
          {txt?.truncated
            ? "The message is longer than shown here. The file itself is the original: download it to read all of it."
            : "A readable copy of the message. The file itself is the original."}
        </CopyNote>
      </div>
    );
  }

  return <Unavailable what="This original" />;
}
