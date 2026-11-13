// Scanning: Apple's document scanner (or photos from the library), then a
// queue that survives no network and restarts. Each scan shows in the list
// at once with its picture, turns into the real receipt when the server has
// read it, and stays on the phone until then.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from "react-native-document-scanner-plugin";
import { useAuth } from "../../auth/AuthProvider";
import { s } from "../../i18n";
import { ApiError, apiResponse, reportScanProblem } from "../api";
import { useHome } from "../HomeProvider";
import { currentScanUri, deleteFile, deleteScansOlderThan, prepareScan, scanFileSize } from "./files";
import {
  MAX_ATTEMPTS,
  classifyUpload,
  dueScans,
  nextRetryAt,
  receiptFromScan,
  resumeQueue,
  isExpired,
  nextAttemptAt,
  retryAfterMs,
  SCAN_MAX_AGE_MS,
  type PendingScan,
  type UploadProblem,
} from "./queue";

export const SCANS_PREFIX = "scans:v1:";
const PICK_LIMIT = 20;

type ScanState = {
  pending: PendingScan[];
  /** Opens the camera scanner (or the photo library where there is none). */
  scan: () => Promise<void>;
  pickPhotos: () => Promise<void>;
  remove: (id: string) => void;
  retry: (id: string) => void;
};

const ScanContext = createContext<ScanState | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const { userId, signOut } = useAuth();
  const { mutateReceipts, refresh } = useHome();
  const [pending, setPending] = useState<PendingScan[]>([]);
  const queue = useRef<PendingScan[]>([]);
  const loaded = useRef(false);
  const wake = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One source of truth (the ref, for the upload loop), mirrored into state
  // for the screens and onto disk for restarts.
  const commit = useCallback(
    (next: PendingScan[]) => {
      queue.current = next;
      setPending(next);
      if (userId) void AsyncStorage.setItem(SCANS_PREFIX + userId, JSON.stringify(next)).catch(() => {});
    },
    [userId],
  );
  const update = useCallback(
    (id: string, change: Partial<PendingScan> | null) => {
      commit(
        change === null
          ? queue.current.filter((x) => x.id !== id)
          : queue.current.map((x) => (x.id === id ? { ...x, ...change } : x)),
      );
    },
    [commit],
  );

  const upload = useCallback(
    async (item: PendingScan) => {
      const attempts = item.attempts + 1;
      // A picture that is no longer on the phone can never be sent: say so
      // instead of retrying it as if the network were down.
      if (scanFileSize(item.fileUri) === null) {
        update(item.id, { state: "missing", attempts });
        void reportScanProblem({ problem: "missing", status: 0, attempts });
        return;
      }
      update(item.id, { state: "uploading", attempts });
      let status = 0;
      // Set when no HTTP answer came back.
      let noAnswer: "network" | "timeout" | null = null;
      let body: unknown = null;
      let retryAfter: number | null = null;
      try {
        const form = new FormData();
        // React Native reads the file from its uri when sending.
        form.append("file", { uri: item.fileUri, name: `${item.id}.jpg`, type: "image/jpeg" } as unknown as Blob);
        // The scan's own id: a resend is answered with the receipt already
        // saved, never read twice (POST /api/capture/scan).
        form.append("client_id", item.id);
        const res = await apiResponse("/api/capture/scan", { method: "POST", body: form });
        status = res.status;
        retryAfter = retryAfterMs(res.headers.get("Retry-After"));
        body = await res.json().catch(() => null);
      } catch (err) {
        if (err instanceof ApiError && err.kind === "unauthorized") {
          await signOut({ keepScans: true });
          return;
        }
        // No answer: keep it and try again later.
        noAnswer = err instanceof ApiError && err.timedOut ? "timeout" : "network";
      }

      const outcome = status ? classifyUpload(status, body) : null;
      if (outcome === null || outcome.kind === "retry") {
        // What went wrong, honestly: a failed request only means "offline"
        // when a small call to the server fails too. The same call tells
        // the server (and Sentry) about it.
        const reported = outcome?.problem ?? (noAnswer === "timeout" ? "timeout" : "unsent");
        const reached = await reportScanProblem({ problem: reported, status, attempts });
        const problem: UploadProblem = noAnswer === "network" && !reached ? "offline" : reported;
        if (attempts >= MAX_ATTEMPTS) {
          update(item.id, { state: "failed", problem });
          AccessibilityInfo.announceForAccessibility(s.scan.failed);
        } else {
          update(item.id, { state: "waiting", problem, retryAt: nextAttemptAt(attempts, retryAfter, Date.now()) });
        }
        return;
      }
      switch (outcome.kind) {
        case "saved": {
          deleteFile(item.fileUri);
          update(item.id, null);
          mutateReceipts((rs) => [receiptFromScan(outcome.saved), ...rs.filter((r) => r.id !== outcome.saved.id)]);
          // One tick for a batch: only when the last scan of it is in.
          if (!queue.current.some((x) => x.state === "waiting" || x.state === "uploading")) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          AccessibilityInfo.announceForAccessibility(s.scan.added);
          // The server's full row (category, conversions) shortly after;
          // several scans finishing together share one refresh.
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => void refresh(), 1_500);
          break;
        }
        case "notReceipt":
          update(item.id, { state: "notReceipt" });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          AccessibilityInfo.announceForAccessibility(s.scan.notReceipt);
          break;
        case "failed":
          update(item.id, { state: "failed" });
          void reportScanProblem({ problem: "refused", status, attempts });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          AccessibilityInfo.announceForAccessibility(s.scan.failed);
          break;
      }
    },
    [update, mutateReceipts, refresh, signOut],
  );

  // Send what's due, then sleep until the next retry.
  const pump = useCallback(() => {
    if (!loaded.current) return;
    if (wake.current) clearTimeout(wake.current);
    for (const item of dueScans(queue.current, Date.now())) {
      void upload(item).finally(() => pump());
    }
    const next = nextRetryAt(queue.current);
    if (next !== null) wake.current = setTimeout(pump, Math.max(500, next - Date.now()));
  }, [upload]);

  // Load the queue left by the last run, then start sending.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    AsyncStorage.getItem(SCANS_PREFIX + userId)
      .then((raw) => (raw ? (JSON.parse(raw) as PendingScan[]) : []))
      .catch(() => [] as PendingScan[])
      .then((saved) => {
        if (!alive) return;
        loaded.current = true;
        // Very old scans go, with their files (and any other user's left behind).
        const now = Date.now();
        for (const old of saved.filter((x) => isExpired(x, now))) deleteFile(old.fileUri);
        deleteScansOlderThan(SCAN_MAX_AGE_MS, now);
        // A full path saved by an earlier run may point into a folder iOS
        // has since moved (app update): find the file in today's folder.
        const kept = saved.filter((x) => !isExpired(x, now)).map((x) => {
          const fileUri = currentScanUri(x.fileUri);
          // Found again where an earlier run had lost it: send it after all.
          if (x.state === "missing" && scanFileSize(fileUri) !== null) {
            return { ...x, fileUri, state: "waiting" as const, attempts: 0, retryAt: 0, problem: undefined };
          }
          return { ...x, fileUri };
        });
        commit(resumeQueue([...kept, ...queue.current.filter((q) => !kept.some((x) => x.id === q.id))]));
        pump();
      });
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      // Back in the app: whatever was waiting for a retry may go now. Only
      // when something is (the queue is almost always empty): no new array,
      // render or saved-copy write for nothing.
      if (queue.current.some((x) => x.state === "waiting" && x.retryAt > 0)) {
        commit(queue.current.map((x) => (x.state === "waiting" ? { ...x, retryAt: 0 } : x)));
      }
      pump();
    });
    return () => {
      alive = false;
      sub.remove();
      if (wake.current) clearTimeout(wake.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [userId, commit, pump]);

  const enqueue = useCallback(
    async (uris: string[], removeSources: boolean) => {
      if (uris.length === 0) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const added: PendingScan[] = [];
      for (const uri of uris) {
        const id = Crypto.randomUUID();
        try {
          const fileUri = await prepareScan(uri, id, removeSources);
          added.push({ id, fileUri, createdAt: new Date().toISOString(), state: "waiting", attempts: 0, retryAt: 0 });
        } catch {
          // An unreadable image: skip it rather than block the rest.
        }
      }
      if (added.length === 0) {
        Alert.alert(s.scan.failed);
        return;
      }
      commit([...added.reverse(), ...queue.current]);
      pump();
    },
    [commit, pump],
  );

  const pickPhotos = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: PICK_LIMIT,
      quality: 1,
    });
    if (result.canceled) return;
    // The picker's copies are in the app's caches: ours to remove.
    await enqueue(
      result.assets.map((a) => a.uri),
      true,
    );
  }, [enqueue]);

  const scan = useCallback(async () => {
    try {
      const result = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        croppedImageQuality: 90,
      });
      if (result.status === ScanDocumentResponseStatus.Cancel) return;
      await enqueue(result.scannedImages ?? [], true);
    } catch {
      // No camera scanner here (the Simulator, or a refused camera): the
      // photo library still works.
      Alert.alert(s.scan.unavailable, undefined, [
        { text: s.common.cancel, style: "cancel" },
        { text: s.scan.fromPhotos, onPress: () => void pickPhotos() },
      ]);
    }
  }, [enqueue, pickPhotos]);

  const remove = useCallback(
    (id: string) => {
      const item = queue.current.find((x) => x.id === id);
      if (item) deleteFile(item.fileUri);
      update(id, null);
    },
    [update],
  );

  const retry = useCallback(
    (id: string) => {
      update(id, { state: "waiting", attempts: 0, retryAt: 0, problem: undefined });
      pump();
    },
    [update, pump],
  );

  // One value per change of the queue: a new object every render made every
  // screen reading useScans() render again with each home refresh.
  const value = useMemo(() => ({ pending, scan, pickPhotos, remove, retry }), [pending, scan, pickPhotos, remove, retry]);
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScans(): ScanState {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScans outside ScanProvider");
  return ctx;
}
