// The home screen's data for every signed-in screen: the cached copy at
// once, then the server's. Refreshed on pull and when the app comes back to
// the foreground; a 401 signs the user out.
//
// Changes made on the phone (a new scan, an edit, a delete) are applied at
// once with mutateReceipts(). A refresh that started before such a change
// may return the list without it; its answer is then dropped and the list
// fetched again, so a change never flickers away.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, LayoutAnimation } from "react-native";
import type { MobileHome, MobileReceipt } from "@/lib/mobile/types";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, getHome } from "./api";
import { readHome, writeHome } from "./cache";

type HomeState = {
  home: MobileHome | null;
  /** The last refresh failed; `home` (if any) is the saved copy. */
  error: "offline" | "server" | null;
  refreshing: boolean;
  /** True until the first answer (server or cache) is known. */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Change the list on the phone right away (and in the saved copy). */
  mutateReceipts: (change: (receipts: MobileReceipt[]) => MobileReceipt[]) => void;
  /** Same, for anything else on the home data (an answered invite). */
  mutateHome: (change: (home: ReadyHome) => ReadyHome) => void;
};

export type ReadyHome = Extract<MobileHome, { state: "ready" }>;

const HomeContext = createContext<HomeState | null>(null);

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const [home, setHome] = useState<MobileHome | null>(null);
  const [error, setError] = useState<HomeState["error"]>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef<Promise<void> | null>(null);
  // Bumped by every local change.
  const version = useRef(0);

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
          setHome(next);
          setError(null);
          void writeHome(userId, next);
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
  }, [userId, signOut]);

  const mutateHome = useCallback<HomeState["mutateHome"]>(
    (change) => {
      version.current += 1;
      // Rows slide into their new places (iOS's own animation).
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHome((current) => {
        if (!current || current.state !== "ready") return current;
        const next = change(current);
        if (userId) void writeHome(userId, next);
        return next;
      });
    },
    [userId],
  );

  const mutateReceipts = useCallback<HomeState["mutateReceipts"]>(
    (change) => mutateHome((current) => ({ ...current, receipts: change(current.receipts) })),
    [mutateHome],
  );

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
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [userId, refresh]);

  return (
    <HomeContext.Provider value={{ home, error, refreshing, loading, refresh, mutateReceipts, mutateHome }}>
      {children}
    </HomeContext.Provider>
  );
}

export function useHome(): HomeState {
  const ctx = useContext(HomeContext);
  if (!ctx) throw new Error("useHome outside HomeProvider");
  return ctx;
}
