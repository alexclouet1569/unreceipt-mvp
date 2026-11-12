// The Account tab's data (GET /api/mobile/account): the saved copy at once,
// then the server's, loaded the first time a screen asks for it and again
// after every change. Same rules as HomeProvider: a 401 signs out, offline
// keeps the saved copy.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MobileAccount } from "@/lib/mobile/types";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, getAccount } from "./api";
import { readAccount, writeAccount } from "./cache";

type AccountState = {
  account: MobileAccount | null;
  error: "offline" | "server" | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Called by screens that show the account, so it loads only when needed. */
  ensure: () => void;
};

const AccountContext = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const [account, setAccount] = useState<MobileAccount | null>(null);
  const [error, setError] = useState<AccountState["error"]>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const started = useRef(false);

  const refresh = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const run = (async () => {
      try {
        const next = await getAccount();
        setAccount(next);
        setError(null);
        void writeAccount(userId, next);
      } catch (err) {
        if (err instanceof ApiError && err.kind === "unauthorized") {
          await signOut({ keepScans: true });
          return;
        }
        setError(err instanceof ApiError && err.kind === "offline" ? "offline" : "server");
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [userId, signOut]);

  const ensure = useCallback(() => {
    if (started.current || !userId) return;
    started.current = true;
    readAccount(userId).then((saved) => {
      if (saved) setAccount((current) => current ?? saved);
    });
    void refresh();
  }, [userId, refresh]);

  // Another person signing in on this phone starts from nothing.
  useEffect(() => {
    started.current = false;
    setAccount(null);
    setError(null);
  }, [userId]);

  const value = useMemo(
    () => ({ account, error, refreshing, refresh, ensure }),
    [account, error, refreshing, refresh, ensure],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount outside AccountProvider");
  const { ensure } = ctx;
  useEffect(() => ensure(), [ensure]);
  return ctx;
}
