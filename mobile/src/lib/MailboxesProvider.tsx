// Account → Your email: the connected Gmail / Outlook mailboxes
// (GET /api/mobile/mailboxes) and the connect flow, shared by Account and
// the Receipts screen's first run and empty state.
//
// Connect (and Reconnect) always goes through our explainer sheet first,
// then the system sign-in sheet (ASWebAuthenticationSession), then the
// claim with this phone's own sign-in (src/lib/mailboxes.ts). The result is
// said in a native alert (read by VoiceOver), with a haptic.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActionSheetIOS, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import type { MobileMailboxConnection, MobileMailboxes } from "@/lib/mobile/types";
import { useAuth } from "../auth/AuthProvider";
import { ConnectMailboxSheet } from "../components/ConnectMailboxSheet";
import { fill, s } from "../i18n";
import { ApiError, claimMailbox, createMailboxConnectLink, disconnectMailbox, getMailboxes } from "./api";
import { readMailboxes, writeMailboxes } from "./cache";
import {
  RETURN_URL,
  claimCode,
  configuredProviders,
  disconnectOutcome,
  finishOutcome,
  onInbox,
  removeAccessNote,
  runConnect,
  takeFromInbox,
  type ConnectDeps,
  type ConnectResult,
  type MailboxProvider,
} from "./mailboxes";

type MailboxesState = {
  data: MobileMailboxes | null;
  error: "offline" | "server" | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  ensure: () => void;
  /** Providers that can be connected now (empty while loading). */
  providers: MailboxProvider[];
  /** A new mailbox can be added: a provider is configured and the limit isn't reached. */
  canAdd: boolean;
  /** Opens the explainer for one provider, or asks which one first. */
  connect: (provider?: MailboxProvider) => void;
  disconnect: (conn: MobileMailboxConnection) => void;
  /** The provider whose flow is running. */
  connecting: MailboxProvider | null;
  disconnecting: string | null;
};

const MailboxesContext = createContext<MailboxesState | null>(null);

// Codes already sent to /claim, for the app's lifetime: the sign-in sheet's
// answer and a deep link must never claim twice.
const CLAIMED = new Set<string>();

const providerName = (p: MailboxProvider) => (p === "google" ? s.mailboxes.providerGoogle : s.mailboxes.providerMicrosoft);

export function MailboxesProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const [data, setData] = useState<MobileMailboxes | null>(null);
  const [error, setError] = useState<MailboxesState["error"]>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<MailboxProvider | null>(null);
  const [connecting, setConnecting] = useState<MailboxProvider | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const started = useRef(false);
  const queued = useRef<MailboxProvider | null>(null);
  const running = useRef(false);

  const save = useCallback(
    (next: MobileMailboxes) => {
      setData(next);
      if (userId) void writeMailboxes(userId, next);
    },
    [userId],
  );

  const refresh = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const run = (async () => {
      try {
        const next = await getMailboxes();
        save(next);
        setError(null);
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
  }, [userId, signOut, save]);

  const ensure = useCallback(() => {
    if (started.current || !userId) return;
    started.current = true;
    readMailboxes(userId).then((saved) => {
      if (saved) setData((current) => current ?? saved);
    });
    void refresh();
  }, [userId, refresh]);

  // Another person signing in on this phone starts from nothing.
  useEffect(() => {
    started.current = false;
    setData(null);
    setError(null);
  }, [userId]);

  const deps = useMemo<ConnectDeps>(
    () => ({
      connectLink: createMailboxConnectLink,
      openSession: (url) => WebBrowser.openAuthSessionAsync(url, RETURN_URL),
      claim: claimMailbox,
      claimed: CLAIMED,
    }),
    [],
  );

  const show = useCallback(
    (result: ConnectResult) => {
      switch (result.kind) {
        case "duplicate":
          return;
        case "signedOut":
          void signOut({ keepScans: true });
          return;
        case "cancelled":
          AccessibilityInfo.announceForAccessibility(s.mailboxes.cancelled);
          return;
        case "connected": {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const conn = result.connection;
          if (conn && data) {
            save({ ...data, connections: [...data.connections.filter((c) => c.id !== conn.id), conn] });
          }
          Alert.alert(
            conn ? fill(s.mailboxes.connectedTitle, { email: conn.email }) : s.mailboxes.connectedTitleShort,
            s.mailboxes.connectedBody,
            [{ text: s.mailboxes.ok }],
          );
          void refresh();
          return;
        }
        case "failed": {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          const message =
            result.key === "limit" && data ? fill(s.mailboxes.atLimit, { limit: data.limit }) : s.mailboxes.errors[result.key];
          const retryCode = result.retryCode;
          Alert.alert(
            s.mailboxes.failedTitle,
            message,
            retryCode
              ? [
                  { text: s.common.cancel, style: "cancel" },
                  {
                    text: s.common.retry,
                    onPress: () => {
                      void claimCode(retryCode, deps).then((next) => showRef.current(next));
                    },
                  },
                ]
              : [{ text: s.mailboxes.ok }],
          );
          if (result.key === "limit") void refresh();
          return;
        }
      }
    },
    [data, deps, refresh, save, signOut],
  );
  // The retry button's later answer uses the current list.
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  }, [show]);

  const runQueued = useCallback(() => {
    const provider = queued.current;
    queued.current = null;
    if (!provider || running.current) return;
    running.current = true;
    setConnecting(provider);
    void runConnect(provider, deps)
      .then((result) => showRef.current(result))
      .finally(() => {
        running.current = false;
        setConnecting(null);
      });
  }, [deps]);

  // A result that came in as a deep link (src/app/+native-intent.tsx).
  useEffect(() => {
    if (!userId) return;
    const pick = () => {
      const outcome = takeFromInbox();
      if (!outcome) return;
      // While the sign-in sheet is open, its own answer says how it ended;
      // only a claim code is acted on (once, CLAIMED).
      if (running.current && outcome.kind !== "claim") return;
      void finishOutcome(outcome, deps).then((result) => showRef.current(result));
    };
    pick();
    return onInbox(pick);
  }, [userId, deps]);

  const providers = useMemo(() => configuredProviders(data?.providers), [data]);
  const canAdd = Boolean(data && providers.length > 0 && data.connections.length < data.limit);

  const connect = useCallback(
    (provider?: MailboxProvider) => {
      if (running.current) return;
      if (provider) {
        setSheet(provider);
        return;
      }
      if (providers.length === 1) {
        setSheet(providers[0]);
        return;
      }
      if (providers.length === 0) return;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: s.mailboxes.chooseTitle,
          options: [...providers.map(providerName), s.common.cancel],
          cancelButtonIndex: providers.length,
        },
        (index) => {
          if (index < providers.length) setSheet(providers[index]);
        },
      );
    },
    [providers],
  );

  // Continue: the explainer closes first, then the system sheet opens (two
  // sheets can't animate at once). onDismiss is the signal; the timer is
  // the safety net if it never fires.
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onContinue = useCallback(() => {
    if (!sheet) return;
    queued.current = sheet;
    setSheet(null);
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = setTimeout(runQueued, 800);
  }, [sheet, runQueued]);
  const onDismissed = useCallback(() => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    runQueued();
  }, [runQueued]);
  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );

  const disconnect = useCallback(
    (conn: MobileMailboxConnection) => {
      Alert.alert(fill(s.mailboxes.disconnectConfirm, { email: conn.email }), s.mailboxes.disconnectBody, [
        { text: s.common.cancel, style: "cancel" },
        {
          text: s.mailboxes.disconnect,
          style: "destructive",
          onPress: () => {
            setDisconnecting(conn.id);
            void (async () => {
              try {
                const res = await disconnectMailbox(conn.id);
                if (disconnectOutcome(res.ok ? 200 : res.status) === "gone") {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  // Outlook (or a Google revoke that failed): where to remove
                  // the access at the provider, in an alert VoiceOver reads.
                  const note = removeAccessNote(conn.provider, res.ok ? res.data.revoked : undefined, s.mailboxes);
                  if (note) Alert.alert(s.mailboxes.disconnected, note);
                  else AccessibilityInfo.announceForAccessibility(s.mailboxes.disconnected);
                  setData((current) => {
                    if (!current) return current;
                    const next = { ...current, connections: current.connections.filter((c) => c.id !== conn.id) };
                    if (userId) void writeMailboxes(userId, next);
                    return next;
                  });
                  return;
                }
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert(s.mailboxes.disconnectFailed);
              } catch (err) {
                if (err instanceof ApiError && err.kind === "unauthorized") {
                  await signOut({ keepScans: true });
                  return;
                }
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert(
                  err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.mailboxes.disconnectFailed,
                );
              } finally {
                setDisconnecting(null);
              }
            })();
          },
        },
      ]);
    },
    [signOut, userId],
  );

  const value = useMemo(
    () => ({
      data,
      error,
      refreshing,
      refresh,
      ensure,
      providers,
      canAdd,
      connect,
      disconnect,
      connecting,
      disconnecting,
    }),
    [data, error, refreshing, refresh, ensure, providers, canAdd, connect, disconnect, connecting, disconnecting],
  );
  return (
    <MailboxesContext.Provider value={value}>
      {children}
      <ConnectMailboxSheet
        provider={sheet}
        onContinue={onContinue}
        onCancel={() => setSheet(null)}
        onDismissed={onDismissed}
      />
    </MailboxesContext.Provider>
  );
}

export function useMailboxes(): MailboxesState {
  const ctx = useContext(MailboxesContext);
  if (!ctx) throw new Error("useMailboxes outside MailboxesProvider");
  const { ensure } = ctx;
  useEffect(() => ensure(), [ensure]);
  return ctx;
}
