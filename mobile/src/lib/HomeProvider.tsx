// The home screen's data for every signed-in screen: the cached copy at
// once, then the server's. Refreshed on pull, when the app comes back to the
// foreground, and after the server answers 401 the user is signed out.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { MobileHome } from "@/lib/mobile/types";
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
};

const HomeContext = createContext<HomeState | null>(null);

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const [home, setHome] = useState<MobileHome | null>(null);
  const [error, setError] = useState<HomeState["error"]>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (!userId) return Promise.resolve();
    // One request at a time: a pull during a foreground refresh joins it.
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const run = (async () => {
      try {
        const next = await getHome();
        setHome(next);
        setError(null);
        void writeHome(userId, next);
      } catch (err) {
        if (err instanceof ApiError && err.kind === "unauthorized") {
          await signOut();
          return;
        }
        setError(err instanceof ApiError && err.kind === "offline" ? "offline" : "server");
      } finally {
        setRefreshing(false);
        setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [userId, signOut]);

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
    <HomeContext.Provider value={{ home, error, refreshing, loading, refresh }}>
      {children}
    </HomeContext.Provider>
  );
}

export function useHome(): HomeState {
  const ctx = useContext(HomeContext);
  if (!ctx) throw new Error("useHome outside HomeProvider");
  return ctx;
}
