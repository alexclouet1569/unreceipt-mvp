// The receipt's photo: a 5-minute link from GET /api/receipts/[id]/original
// (owner only, signed by the server). The picture is kept on the phone under
// the receipt's id (expo-image's cache): when it is there, it shows at once
// from the disk without asking the server. A link is kept for 4 minutes per
// receipt, so the full-screen viewer and a quick reopen don't ask again.

import { useCallback, useEffect, useState } from "react";
import { Image } from "expo-image";
import type { OriginalPreview, ReceiptOriginal } from "@/lib/mobile/types";
import { apiResponse, authorizedDownload } from "./api";
import { onSignOutClear } from "./cache";

export function photoCacheKey(id: string): string {
  return `receipt-photo-${id}`;
}

const LINK_TTL_MS = 4 * 60_000;
const links = new Map<string, { url: string; until: number }>();
onSignOutClear(() => links.clear());

async function photoUrl(id: string): Promise<string | null> {
  // Already on the phone: the file itself.
  const path = await Image.getCachePathAsync(photoCacheKey(id)).catch(() => null);
  if (path) return path.startsWith("file://") ? path : `file://${path}`;
  const kept = links.get(id);
  if (kept && kept.until > Date.now()) return kept.url;
  const res = await apiResponse(`/api/receipts/${encodeURIComponent(id)}/original`);
  const body = (await res.json().catch(() => null)) as { url?: string; kind?: string } | null;
  if (!res.ok || !body?.url || !body.kind?.startsWith("image/")) return null;
  links.set(id, { url: body.url, until: Date.now() + LINK_TTL_MS });
  return body.url;
}

export function useReceiptPhoto(id: string, enabled: boolean): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    photoUrl(id)
      .then((u) => {
        if (!alive) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return { url, failed };
}

// What the "Original" side of the receipt screen shows for a PDF, an email
// or a text message (GET /api/receipts/[id]/original?preview=1): an email
// as plain text the server cut from it (never its HTML), a PDF as the sizes
// of its pages, each then a picture from GET
// /api/receipts/[id]/original/page/<n> (drawn by the server: no PDF viewer
// on the phone, so nothing in the file runs or is followed). Kept per
// receipt while the app runs: an original never changes.

const previews = new Map<string, OriginalPreview>();
onSignOutClear(() => previews.clear());

export type OriginalPage = {
  page: number;
  width: number;
  height: number;
  source: { uri: string; headers: Record<string, string>; cacheKey: string };
};

export function pageCacheKey(id: string, page: number): string {
  return `receipt-page-${id}-${page}`;
}

/** The picture of one PDF page, signed with the session (expo-image sends the header). */
export async function pageSource(id: string, page: number): Promise<OriginalPage["source"]> {
  const { url, headers } = await authorizedDownload(
    `/api/receipts/${encodeURIComponent(id)}/original/page/${page}`,
  );
  return { uri: url, headers, cacheKey: pageCacheKey(id, page) };
}

async function loadPreview(id: string): Promise<OriginalPreview> {
  const kept = previews.get(id);
  if (kept) return kept;
  const res = await apiResponse(`/api/receipts/${encodeURIComponent(id)}/original?preview=1`);
  const body = (await res.json().catch(() => null)) as ReceiptOriginal | null;
  if (!res.ok || !body) throw new Error(`HTTP ${res.status}`);
  const preview = body.preview ?? { type: "unavailable" };
  previews.set(id, preview);
  return preview;
}

export type PreviewState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; preview: OriginalPreview; pages: OriginalPage[] };

/** The preview of a non-photo original; `retry` asks again after a failure. */
export function useOriginalPreview(id: string, enabled: boolean): { state: PreviewState; retry: () => void } {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      try {
        const preview = await loadPreview(id);
        const pages =
          preview.type === "pdf"
            ? await Promise.all(
                preview.pages.map(async (p, i) => ({ page: i + 1, ...p, source: await pageSource(id, i + 1) })),
              )
            : [];
        if (alive) setState({ status: "ready", preview, pages });
      } catch {
        if (alive) setState({ status: "failed" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, enabled, attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
