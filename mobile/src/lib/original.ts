// The receipt's photo: a 5-minute link from GET /api/receipts/[id]/original
// (owner only, signed by the server). The picture is kept on the phone under
// the receipt's id (expo-image's cache): when it is there, it shows at once
// from the disk without asking the server. A link is kept for 4 minutes per
// receipt, so the full-screen viewer and a quick reopen don't ask again.

import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { apiResponse } from "./api";
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
