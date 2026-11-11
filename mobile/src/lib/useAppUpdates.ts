// Over-the-air updates (EAS Update, mobile/README.md "Updates"): a new
// version of the app's screens and logic reaches the phone without a new
// App Store build. expo-updates already checks at every cold start and uses
// a downloaded update at the next one. This hook adds the warm case, since
// iOS rarely cold-starts an app: when the app comes back to the front it
// looks for an update and downloads it; when it comes back after a longer
// break with an update waiting, it restarts on the new version at once.
// Not after a short trip to Mail, Safari or the share sheet: that would
// throw the user out of what they were doing.

import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";

/** Away at least this long: restarting on the new version is welcome, not a surprise. */
const RELOAD_AFTER_MS = 5 * 60_000;
/** Don't ask the server more often than this. */
const CHECK_EVERY_MS = 10 * 60_000;

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
        if (fetched.isNew) ready.current = true;
      } catch {
        // Offline or the update server is busy: the next start tries again.
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
        // Unsent scans are on disk and resume after the restart (ScanProvider).
        void Updates.reloadAsync().catch(() => {});
        return;
      }
      void check();
    });
    return () => sub.remove();
  }, []);
}
