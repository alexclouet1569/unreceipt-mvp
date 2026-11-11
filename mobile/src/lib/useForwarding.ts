// The forwarding guide's data (GET /api/mobile/forwarding), shared by the
// overview and the step screens: loaded once per visit, kept while the app
// runs, refreshed after the user adds or removes an address.

import { useCallback, useEffect, useState } from "react";
import type { MobileForwarding } from "@/lib/mobile/types";
import { ApiError, getForwarding } from "./api";

let saved: { userKey: string; data: MobileForwarding } | null = null;

export function useForwarding(userId: string | null) {
  const key = userId ?? "";
  const [data, setData] = useState<MobileForwarding | null>(saved?.userKey === key ? saved.data : null);
  const [error, setError] = useState<"offline" | "server" | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const next = await getForwarding();
      saved = { userKey: key, data: next };
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === "offline" ? "offline" : "server");
    } finally {
      setLoading(false);
    }
  }, [userId, key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
