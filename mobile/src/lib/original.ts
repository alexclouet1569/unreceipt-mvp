// The receipt's photo: a 5-minute link from GET /api/receipts/[id]/original
// (owner only, signed by the server). The picture is kept on the phone under
// the receipt's id (expo-image's cache), so opening it again is instant.

import { useEffect, useState } from "react";
import { apiResponse } from "./api";

export function photoCacheKey(id: string): string {
  return `receipt-photo-${id}`;
}

export function useReceiptPhoto(id: string, enabled: boolean): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    apiResponse(`/api/receipts/${encodeURIComponent(id)}/original`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { url?: string; kind?: string } | null;
        if (!alive) return;
        if (res.ok && body?.url && body.kind?.startsWith("image/")) setUrl(body.url);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return { url, failed };
}
