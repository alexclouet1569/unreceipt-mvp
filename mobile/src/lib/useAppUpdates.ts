// Over-the-air updates (EAS Update, mobile/README.md "Updates"): a new
// version of the app's screens and logic reaches the phone without a new
// App Store build. expo-updates already checks at every cold start and uses
// a downloaded update at the next one. This hook adds the warm case, since
// iOS rarely cold-starts an app:
// - every time the app comes back to the front (at most once a minute) it
//   looks for an update and downloads it;
// - once one is downloaded, iOS's own alert offers it: "A new version is
//   ready" with Later and Restart. Once per update, never forced;
// - coming back after a longer break with an update waiting, it restarts on
//   the new version by itself. Not after a short trip to Mail, Safari or
//   the share sheet: that would throw the user out of what they were doing.

import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import * as Updates from "expo-updates";
import { s } from "../i18n";

/** Away at least this long: restarting on the new version is welcome, not a surprise. */
const RELOAD_AFTER_MS = 5 * 60_000;
/** Don't ask the server more often than this. */
const CHECK_EVERY_MS = 60_000;
/** A restart waits at most this long for what must be sent first. */
const FLUSH_LIMIT_MS = 3_000;

// Work that must reach the server before the app restarts (a delete still
// inside its Undo window: ReceiptActions). Leaving the app sends it too.
const beforeRestart = new Set<() => Promise<void>>();
export function onBeforeRestart(flush: () => Promise<void>): () => void {
  beforeRestart.add(flush);
  return () => beforeRestart.delete(flush);
}

/** Restart on the downloaded update (unsent scans are on disk and resume). */
export async function restartOnUpdate(): Promise<void> {
  const flushes = Promise.all([...beforeRestart].map((f) => f().catch(() => {})));
  await Promise.race([flushes, new Promise((resolve) => setTimeout(resolve, FLUSH_LIMIT_MS))]);
  await Updates.reloadAsync().catch(() => {});
}

export function useAppUpdates(): void {
  const backgroundSince = useRef<number | null>(null);
  const lastCheck = useRef(0);
  const ready = useRef(false);

  useEffect(() => {
    // Expo Go and development builds have no update channel.
    if (!Updates.isEnabled || __DEV__) return;

    const check = async () => {
      if (Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      try {
        const found = await Updates.checkForUpdateAsync();
        if (!found.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) return;
        ready.current = true;
        if (AppState.currentState !== "active") return;
        Alert.alert(s.common.updateReady, undefined, [
          { text: s.common.updateLater, style: "cancel" },
          { text: s.common.updateRestart, onPress: () => void restartOnUpdate() },
        ]);
      } catch {
        // Offline or the update server is busy: the next return tries again.
      }
    };

    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundSince.current = Date.now();
        return;
      }
      if (state !== "active") return;
      const away = backgroundSince.current ? Date.now() - backgroundSince.current : 0;
      backgroundSince.current = null;
      if (ready.current && away >= RELOAD_AFTER_MS) {
        void restartOnUpdate();
        return;
      }
      void check();
    });
    return () => sub.remove();
  }, []);
}
