// The Clients tab's data (accounting firm staff, GET /api/mobile/firm):
// the firm's clients with this month's counts, waiting invites and the
// firm's join link. Loaded only for a member of a firm (home says so),
// refreshed on pull and when the tab comes back into view; held in memory
// only (client data isn't kept on the phone), forgotten at sign-out.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MobileFirmHome } from "@/lib/mobile/types";
import { ApiError, getFirmHome } from "./api";
import { useHome } from "./HomeProvider";

type FirmState = {
  /** The signed-in user works at a firm (the Clients tab shows). */
  isMember: boolean;
  firm: MobileFirmHome | null;
  error: "offline" | "server" | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

const FirmContext = createContext<FirmState | null>(null);

export function FirmProvider({ children }: { children: React.ReactNode }) {
  const { home } = useHome();
  const isMember = home != null && home.state !== "inactive" && home.firm != null;
  const [firm, setFirm] = useState<MobileFirmHome | null>(null);
  const [error, setError] = useState<FirmState["error"]>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (!isMember) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const run = (async () => {
      try {
        setFirm(await getFirmHome(null));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError && err.kind === "offline" ? "offline" : "server");
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [isMember]);

  useEffect(() => {
    if (isMember) void refresh();
    else setFirm(null);
  }, [isMember, refresh]);

  const value = useMemo(() => ({ isMember, firm, error, refreshing, refresh }), [isMember, firm, error, refreshing, refresh]);
  return <FirmContext.Provider value={value}>{children}</FirmContext.Provider>;
}

export function useFirm(): FirmState {
  const ctx = useContext(FirmContext);
  if (!ctx) throw new Error("useFirm outside FirmProvider");
  return ctx;
}
