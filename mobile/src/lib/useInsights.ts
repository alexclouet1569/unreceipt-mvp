// One period of the Insights tab: the saved answer at once (an instant
// screen, offline too), then the server's. Refreshed when the period
// changes, when the receipts list changes (a scan, an edit) and on pull.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MobileAnalytics } from "@/lib/mobile/types";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, getAnalytics } from "./api";
import { readInsights, writeInsights } from "./cache";
import { useHome } from "./HomeProvider";
import { periodCacheKey, periodQueryString, type PeriodQuery } from "./insights";

export type InsightsState = {
  data: MobileAnalytics | null;
  /** The last refresh failed; `data` (if any) is the saved copy. */
  error: "offline" | "server" | null;
  refreshing: boolean;
  /** No answer yet for this period, saved or fresh. */
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useInsights(query: PeriodQuery): InsightsState {
  const { userId, signOut } = useAuth();
  const { home, extra } = useHome();
  const key = periodCacheKey(query);
  const qs = periodQueryString(query);
  const [state, setState] = useState<{ key: string; data: MobileAnalytics | null }>({ key, data: null });
  const [error, setError] = useState<InsightsState["error"]>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestKey = useRef(key);
  latestKey.current = key;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const forKey = key;
    setRefreshing(true);
    try {
      const data = await getAnalytics(qs);
      if (latestKey.current !== forKey) return;
      setState({ key: forKey, data });
      setError(null);
      void writeInsights(userId, forKey, data);
    } catch (err) {
      if (latestKey.current !== forKey) return;
      if (err instanceof ApiError && err.kind === "unauthorized") {
        await signOut({ keepScans: true });
        return;
      }
      setError(err instanceof ApiError && err.kind === "offline" ? "offline" : "server");
    } finally {
      if (latestKey.current === forKey) setRefreshing(false);
    }
  }, [userId, key, qs, signOut]);

  // A new period: its saved copy first (if any), then the server.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setError(null);
    void readInsights(userId, key).then((cached) => {
      if (!alive || !cached) return;
      setState((current) => (current.key === key && current.data ? current : { key, data: cached }));
    });
    void refresh();
    return () => {
      alive = false;
    };
  }, [userId, key, refresh]);

  // The receipts changed (a scan landed, an edit, a delete): ask again,
  // gently, so a burst of changes is one request.
  const receipts = home?.state === "ready" ? home.receipts : null;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void refresh(), 1_500);
    return () => clearTimeout(t);
  }, [receipts, extra, refresh]);

  const data = state.key === key ? state.data : null;
  return { data, error, refreshing, loading: data == null && error == null, refresh };
}
