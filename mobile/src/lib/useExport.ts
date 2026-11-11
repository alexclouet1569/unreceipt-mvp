// Runs one export at a time for a screen (Export receipts, Delete account):
// which period is being prepared, the message to show, and the parts to
// share when there is more than one. A single file opens the share sheet
// by itself.

import { useCallback, useState } from "react";
import { AccessibilityInfo, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { fill, s } from "../i18n";
import { ApiError } from "./api";
import { prepareExport, shareFile } from "./exports";

export type ExportState = {
  busy: string | null;
  message: string | null;
  /** Several parts: the screen lists them with a Share button each. */
  parts: { uri: string; filename: string }[];
  done: boolean;
  run: (period: string, label: string) => Promise<void>;
  share: (uri: string) => Promise<void>;
};

export function useExport(): ExportState {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [parts, setParts] = useState<{ uri: string; filename: string }[]>([]);
  const [done, setDone] = useState(false);

  // A note on a finished export stays on the screen; a problem is an alert,
  // so it's seen wherever the tapped row was in a long list.
  const say = (text: string) => {
    setMessage(text);
    AccessibilityInfo.announceForAccessibility(text);
  };
  const fail = (text: string) => {
    setMessage(null);
    Alert.alert(text);
  };

  const share = useCallback(async (uri: string) => {
    try {
      await shareFile(uri);
    } catch {
      // Closing the sheet is not an error worth showing.
    }
  }, []);

  const run = useCallback(
    async (period: string, label: string) => {
      if (busy) return;
      setBusy(period);
      setMessage(null);
      setParts([]);
      try {
        const outcome = await prepareExport(period);
        switch (outcome.kind) {
          case "ready": {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setDone(true);
            if (outcome.missing > 0) say(fill(s.exporting.missing, { count: outcome.missing }));
            if (outcome.files.length === 1) {
              await share(outcome.files[0].uri);
            } else {
              setParts(outcome.files);
              say(fill(s.exporting.parts, { count: outcome.files.length }));
            }
            break;
          }
          case "empty":
            fail(fill(s.exporting.empty, { period: label }));
            break;
          case "tooMany":
            fail(s.exporting.tooMany);
            break;
          case "rateLimited":
            fail(s.exporting.rateLimited);
            break;
          case "downloadFailed":
            fail(s.exporting.downloadFailed);
            break;
          default:
            fail(s.exporting.failed);
        }
        if (outcome.kind !== "ready") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch (err) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        fail(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.exporting.failed);
      } finally {
        setBusy(null);
      }
    },
    [busy, share],
  );

  return { busy, message, parts, done, run, share };
}
