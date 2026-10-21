"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReceiptOriginalKind } from "@/lib/types";
import { useI18n } from "@/lib/i18n/client";

// Tailwind utility helper kept inline — the project's Button primitive
// doesn't support `asChild`, so download/open-in-new-tab actions are
// rendered as plain styled anchors. Button is still used for the retry
// affordance which is a real button.

type EmlPreview = {
  type: "eml";
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  text: string;
};

type TxtPreview = {
  type: "txt";
  body: string;
};

type OriginalPayload = {
  url: string;
  kind: ReceiptOriginalKind;
  filename: string;
  preview?: EmlPreview | TxtPreview;
};

type FetchState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ok"; payload: OriginalPayload };

type OriginalSourceViewerProps = {
  receiptId: string;
  smsFromHint?: string | null;
};

export function OriginalSourceViewer({
  receiptId,
  smsFromHint,
}: OriginalSourceViewerProps) {
  const { locale, t: messages } = useI18n();
  const t = messages.receipt.original;
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/receipts/${receiptId}/original`, {
          cache: "no-store",
        });
        if (cancelled) return;

        if (res.status === 404) {
          const body = await res.json().catch(() => ({}));
          if (body?.error === "no_original") {
            setState({ kind: "missing" });
            return;
          }
          setState({ kind: "error", message: t.notFound });
          return;
        }

        if (!res.ok) {
          setState({
            kind: "error",
            message: t.loadFailedStatus(res.status),
          });
          return;
        }

        const payload = (await res.json()) as OriginalPayload;
        setState({ kind: "ok", payload });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          // The browser's own error text is English; only English shows it.
          message: err instanceof Error && locale === "en" ? err.message : t.loadFailed,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [receiptId, reloadKey, locale, t]);

  if (state.kind === "loading") {
    return (
      <div
        className="flex items-center justify-center gap-2 py-12 text-[var(--ink-muted)]"
        data-testid="original-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t.loading}</span>
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div
        className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]"
        data-testid="original-missing"
      >
        {t.missing}
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
          {t.retry}
        </Button>
      </div>
    );
  }

  const { url, kind, filename, preview } = state.payload;

  return (
    <div className="px-4 py-4 space-y-3" data-testid="original-viewer">
      <ArtifactBody
        kind={kind}
        url={url}
        preview={preview}
        smsFromHint={smsFromHint}
      />
      <DownloadRow url={url} filename={filename} />
    </div>
  );
}

function ArtifactBody({
  kind,
  url,
  preview,
  smsFromHint,
}: {
  kind: ReceiptOriginalKind;
  url: string;
  preview: EmlPreview | TxtPreview | undefined;
  smsFromHint?: string | null;
}) {
  const { t: messages } = useI18n();
  const t = messages.receipt.original;
  if (kind === "image/jpeg" || kind === "image/png" || kind === "image/webp") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={t.imageAlt}
        className="w-full max-h-[60vh] object-contain rounded-md bg-[var(--background)]"
      />
    );
  }

  if (kind === "application/pdf") {
    return (
      <div className="rounded-md overflow-hidden border border-[var(--hairline)] bg-[var(--background)]">
        <iframe
          src={url}
          title={t.pdfTitle}
          className="w-full h-[60vh] bg-white"
        />
      </div>
    );
  }

  if (kind === "eml") {
    const eml = preview?.type === "eml" ? preview : null;
    return (
      <div className="rounded-md border border-[var(--hairline)] bg-card overflow-hidden">
        <dl className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-[var(--hairline)] text-[12px]">
          <dt className="font-semibold text-[var(--ink-faint)] uppercase tracking-[0.06em]">
            {t.from}
          </dt>
          <dd className="text-[var(--ink)] break-words">
            {eml?.from ?? "—"}
          </dd>
          <dt className="font-semibold text-[var(--ink-faint)] uppercase tracking-[0.06em]">
            {t.to}
          </dt>
          <dd className="text-[var(--ink)] break-words">{eml?.to ?? "—"}</dd>
          <dt className="font-semibold text-[var(--ink-faint)] uppercase tracking-[0.06em]">
            {t.subject}
          </dt>
          <dd className="text-[var(--ink)] break-words">
            {eml?.subject ?? "—"}
          </dd>
          <dt className="font-semibold text-[var(--ink-faint)] uppercase tracking-[0.06em]">
            {t.date}
          </dt>
          <dd className="text-[var(--ink)] break-words">
            {eml?.date ?? "—"}
          </dd>
        </dl>
        <pre className="px-3 py-3 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-[var(--ink)] max-h-[50vh] overflow-y-auto">
          {eml?.text ?? t.noPreview}
        </pre>
      </div>
    );
  }

  if (kind === "txt") {
    const txt = preview?.type === "txt" ? preview.body : "";
    return (
      <div className="space-y-2">
        {smsFromHint ? (
          <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ink-faint)]">
            {t.smsFrom(smsFromHint)}
          </p>
        ) : null}
        <div
          className="rounded-[14px] px-3 py-3 font-accent italic text-[var(--ink)]"
          style={{
            background: "var(--color-brand-light, #ECF7E7)",
            fontSize: "14px",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {txt || t.noPreview}
        </div>
      </div>
    );
  }

  // Defensive fallback — unknown kind.
  return (
    <div className="text-sm text-[var(--ink-muted)] text-center py-8">
      {t.unknownFormat}
    </div>
  );
}

function DownloadRow({ url, filename }: { url: string; filename: string }) {
  const { t } = useI18n();
  const linkClass =
    "flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors";
  return (
    <div className="flex gap-2">
      <a href={url} download={filename} className={linkClass}>
        <Download className="w-3.5 h-3.5" />
        {t.receipt.original.download}
      </a>
      <a href={url} target="_blank" rel="noreferrer" className={linkClass}>
        <ExternalLink className="w-3.5 h-3.5" />
        {t.receipt.original.openInNewTab}
      </a>
    </div>
  );
}
