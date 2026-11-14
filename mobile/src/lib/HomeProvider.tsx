// The home screen's data for every signed-in screen: the cached copy at
// once, then the server's. Refreshed on pull and when the app comes back to
// the foreground; a 401 signs the user out.
//
// Changes made on the phone (a new scan, an edit, a delete) are applied at
// once with mutateReceipts(). A refresh that started before such a change
// may return the list without it; its answer is then dropped and the list
// fetched again, so a change never flickers away.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, LayoutAnimation } from "react-native";
import type { MobileHome, MobileReceipt } from "@/lib/mobile/types";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, getHome, getOlderReceipts } from "./api";
import { readHome, writeHome } from "./cache";
import { loadMoreCursor } from "./sections";
import { shareHome, shareReceipts } from "./share";

type HomeState = {
  home: MobileHome | null;
  /** The last refresh failed; `home` (if any) is the saved copy. */
  error: "offline" | "server" | null;
  refreshing: boolean;
  /** The server has answered since the app started (not only the saved copy). */
  fromServer: boolean;
  /** True until the first answer (server or cache) is known. */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Change the list on the phone right away (and in the saved copy). */
  mutateReceipts: (change: (receipts: MobileReceipt[]) => MobileReceipt[]) => void;
  /** Same, for anything else on the home data (an answered invite). */
  mutateHome: (change: (home: ReadyHome) => ReadyHome) => void;
  /**
   * Receipts opened from Insights that aren't in the list (older than the
   * newest 50): kept so their screen, edits and Confirm work as for any
   * other. Never counted in the list's totals.
   */
  extra: MobileReceipt[];
  rememberReceipts: (receipts: MobileReceipt[]) => void;
  mutateExtra: (change: (receipts: MobileReceipt[]) => MobileReceipt[]) => void;
  /**
   * "Load more" at the end of the list: the ids of the older receipts
   * loaded so far, in the list's order (the rows themselves live in
   * `extra`, so they open, change and delete like any other, and never
   * count in the totals: those come from the server's summary).
   */
  older: { ids: string[]; hasMore: boolean; loading: boolean; failed: boolean };
  loadOlder: () => Promise<void>;
};

export type ReadyHome = Extract<MobileHome, { state: "ready" }>;

const rowOrder = (h: ReadyHome) => h.receipts.map((r) => r.id).join(",");

const HomeContext = createContext<HomeState | null>(null);

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const [home, setHome] = useState<MobileHome | null>(null);
  const [error, setError] = useState<HomeState["error"]>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fromServer, setFromServer] = useState(false);
  const [extra, setExtra] = useState<MobileReceipt[]>([]);
  const [olderIds, setOlderIds] = useState<string[]>([]);
  const [olderMore, setOlderMore] = useState<boolean | null>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  // The latest values, for the refresh (which outlives a render).
  const homeRef = useRef(home);
  homeRef.current = home;
  const olderIdsRef = useRef<string[]>([]);
  // Bumped by every local change.
  const version = useRef(0);
  // When the server last answered (a return to the app soon after doesn't ask again).
  const lastFetched = useRef(0);

  const refresh = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();
    // One request at a time: a pull during a foreground refresh joins it.
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const run = (async () => {
      let again = false;
      try {
        // Up to three tries if local changes keep landing meanwhile.
        for (let i = 0; i < 3; i++) {
          const startedAt = version.current;
          const next = await getHome();
          if (version.current !== startedAt) continue;
          // With older pages loaded, receipts pushed out of the newest 50 by
          // new ones move to the top of those pages instead of vanishing.
          const prev = homeRef.current;
          if (olderIdsRef.current.length > 0 && prev?.state === "ready" && next.state === "ready") {
            const now = new Set(next.receipts.map((r) => r.id));
            const pushed = prev.receipts.filter((r) => !now.has(r.id));
            if (pushed.length > 0 && next.receipts.length >= prev.receipts.length) {
              rememberReceipts(pushed);
              setOlderIds((ids) => [...pushed.map((r) => r.id).filter((id) => !ids.includes(id)), ...ids]);
            }
          }
          // The same answer as before keeps the same objects: nothing
          // renders again and the saved copy isn't rewritten.
          const shared = shareHome(homeRef.current, next);
          lastFetched.current = Date.now();
          setFromServer(true);
          setError(null);
          if (shared !== homeRef.current) {
            setHome(shared);
            void writeHome(userId, shared);
          }
          return;
        }
        again = true;
      } catch (err) {
        if (err instanceof ApiError && err.kind === "unauthorized") {
          await signOut({ keepScans: true });
          return;
        }
        setError(err instanceof ApiError && err.kind === "offline" ? "offline" : "server");
      } finally {
        setRefreshing(false);
        setLoading(false);
        inFlight.current = null;
        if (again) setTimeout(() => void refresh(), 2_000);
      }
    })();
    inFlight.current = run;
    return run;
    // rememberReceipts is stable (no dependencies), so it isn't listed.
  }, [userId, signOut]);

  const mutateHome = useCallback<HomeState["mutateHome"]>(
    (change) => {
      const current = homeRef.current;
      if (!current || current.state !== "ready") return;
      version.current += 1;
      const next = change(current);
      // The latest value at once, so two changes in one tick both land.
      homeRef.current = next;
      // Rows slide into their new places (iOS's own animation), only when
      // rows come, go or move: LayoutAnimation animates the next layout
      // anywhere in the app, and an edited field doesn't need it.
      if (rowOrder(current) !== rowOrder(next)) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setHome(next);
      if (userId) void writeHome(userId, next);
    },
    [userId],
  );

  const mutateReceipts = useCallback<HomeState["mutateReceipts"]>(
    (change) => mutateHome((current) => ({ ...current, receipts: change(current.receipts) })),
    [mutateHome],
  );

  const rememberReceipts = useCallback((receipts: MobileReceipt[]) => {
    setExtra((current) => {
      const byId = new Map(current.map((r) => [r.id, r]));
      for (const r of receipts) byId.set(r.id, r);
      // Nothing new: the same array, so screens reading `extra` don't render again.
      return shareReceipts(current, [...byId.values()]);
    });
  }, []);

  const mutateExtra = useCallback<HomeState["mutateExtra"]>((change) => setExtra((current) => change(current)), []);

  olderIdsRef.current = olderIds;
  // Before the first page: more exist when the server counted receipts
  // beyond the list.
  const serverHasOlder = home?.state === "ready" ? (home.older?.count ?? 0) > 0 : false;
  const hasMoreOlder = olderMore ?? serverHasOlder;
  const loadingOlder = useRef(false);
  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || !hasMoreOlder || home?.state !== "ready") return;
    // The page starts after the last receipt shown (keyset, not a count:
    // a receipt added or deleted meanwhile never makes one go missing).
    const byId = new Map(extra.map((r) => [r.id, r]));
    const shown = [...home.receipts, ...olderIds.flatMap((id) => byId.get(id) ?? [])];
    const after = loadMoreCursor(shown);
    if (!after) {
      // A list saved by an older version of the app (no list keys at all):
      // fetch it again first.
      setOlderFailed(true);
      void refresh();
      return;
    }
    loadingOlder.current = true;
    setOlderLoading(true);
    setOlderFailed(false);
    try {
      const page = await getOlderReceipts(after);
      rememberReceipts(page.receipts);
      setOlderIds((ids) => {
        // A receipt added meanwhile shifts the pages by one: no repeats.
        const known = new Set(ids);
        return [...ids, ...page.receipts.map((r) => r.id).filter((id) => !known.has(id))];
      });
      setOlderMore(page.hasMore);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "unauthorized") {
        await signOut({ keepScans: true });
        return;
      }
      setOlderFailed(true);
    } finally {
      loadingOlder.current = false;
      setOlderLoading(false);
    }
  }, [hasMoreOlder, home, extra, olderIds, rememberReceipts, signOut, refresh]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    readHome(userId).then((cached) => {
      if (!alive || !cached) return;
      // Only if the server hasn't answered first.
      setHome((current) => current ?? cached);
      setLoading(false);
    });
    void refresh();
    // Back from the background (not from Control Centre, Face ID or a
    // permission prompt, which only pass through "inactive"), and only
    // when the last answer is more than 30 s old.
    let previous = AppState.currentState;
    const sub = AppState.addEventListener("change", (state) => {
      const wasAway = previous === "background";
      previous = state;
      if (state === "active" && wasAway && Date.now() - lastFetched.current > 30_000) void refresh();
    });
    return () => {
      alive = false;
      sub.remove();
      setExtra([]);
      setOlderIds([]);
      setOlderMore(null);
      setFromServer(false);
    };
  }, [userId, refresh]);

  // A new value only when something in it changed: every screen reading
  // the home data re-renders on each change of this object.
  const older = useMemo(
    () => ({ ids: olderIds, hasMore: hasMoreOlder, loading: olderLoading, failed: olderFailed }),
    [olderIds, hasMoreOlder, olderLoading, olderFailed],
  );
  const value = useMemo(
    () => ({ home, error, refreshing, fromServer, loading, refresh, mutateReceipts, mutateHome, extra, rememberReceipts, mutateExtra, older, loadOlder }),
    [home, error, refreshing, fromServer, loading, refresh, mutateReceipts, mutateHome, extra, rememberReceipts, mutateExtra, older, loadOlder],
  );
  return <HomeContext.Provider value={value}>{children}</HomeContext.Provider>;
}

/** A receipt by id: from the list, else one opened from Insights. */
export function useReceipt(id: string | undefined): MobileReceipt | undefined {
  const { home, extra } = useHome();
  if (!id) return undefined;
  return (home?.state === "ready" ? home.receipts.find((r) => r.id === id) : undefined) ?? extra.find((r) => r.id === id);
}

export function useHome(): HomeState {
  const ctx = useContext(HomeContext);
  if (!ctx) throw new Error("useHome outside HomeProvider");
  return ctx;
}
