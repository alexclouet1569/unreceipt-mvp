// Scanning: Apple's document scanner (or photos from the library), then a
// queue that survives no network and restarts. A camera scan is shown big
// first (Retake or Use, flow.ts), then read on a full screen with a scan
// line over it, and its digital receipt opens when the server has saved it.
// Each scan also shows in the list with its picture until then, and stays on
// the phone until the server has it.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Alert, AppState, Linking, View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from "react-native-document-scanner-plugin";
import { useAuth } from "../../auth/AuthProvider";
import { s } from "../../i18n";
import { ApiError, apiResponse, reportScanProblem } from "../api";
import { useHome } from "../HomeProvider";
import { ScanFlowView } from "../../components/ScanFlowView";
import { cropReceipt } from "../../../modules/receipt-crop";
import {
  adoptDraft,
  currentScanUri,
  deleteAllDrafts,
  deleteFile,
  deleteScansOlderThan,
  prepareScan,
  scanFileSize,
  scanUploadFile,
} from "./files";
import { readingView, withoutDraft, type DraftScan, type ScanFlow } from "./flow";
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
  /**
   * One receipt: the iPhone's camera. The photo stays on screen with
   * Retake / Use Photo (iOS's own), then it is read on the full screen.
   */
  scan: () => Promise<void>;
  /** Several receipts at once: Apple's document scanner, then the review. */
  scanSeveral: () => Promise<void>;
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
  // The review or reading screen, when one is open.
  const [flow, setFlowState] = useState<ScanFlow | null>(null);
  const flowRef = useRef<ScanFlow | null>(null);
  const setFlow = useCallback((next: ScanFlow | null) => {
    flowRef.current = next;
    setFlowState(next);
  }, []);
  const opened = useRef<string | null>(null);
  // Scan id → the receipt the server saved for it (this run only).
  const [saved, setSaved] = useState<Record<string, string>>({});

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
        // The file itself, never React Native's `{ uri, name, type }`: the
        // app's fetch is Expo's (expo/fetch, installed globally by Expo),
        // which can't send that shape and fails before anything leaves the
        // phone. An expo-file-system File has the bytes, the file name
        // (`<id>.jpg`) and its type (image/jpeg) that the server checks.
        form.append("file", scanUploadFile(item.fileUri));
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
          setSaved((m) => ({ ...m, [item.id]: outcome.saved.id }));
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
        // A review left open when the app was closed was never sent: it goes.
        if (!flowRef.current) deleteAllDrafts();
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
    async (uris: string[], removeSources: boolean): Promise<PendingScan[]> => {
      if (uris.length === 0) return [];
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
        return [];
      }
      commit([...[...added].reverse(), ...queue.current]);
      pump();
      return added;
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
    // The picker's copies are in the app's caches: ours to remove. Photos
    // chosen in the library were already looked at: no review. One photo is
    // read on the full screen like a scan; several show in the list.
    const added = await enqueue(
      result.assets.map((a) => a.uri),
      true,
    );
    if (added.length === 1) setFlow({ phase: "reading", ids: [added[0].id], images: [added[0].fileUri] });
  }, [enqueue, setFlow]);

  // Several receipts: Apple's document scanner (it stays open for the next
  // shot), then the review; nothing is sent before Use. Cancelled (also
  // from Retake): whatever was shown stays.
  const scanSeveral = useCallback(async () => {
    try {
      const result = await DocumentScanner.scanDocument({
        responseType: ResponseType.ImageFilePath,
        croppedImageQuality: 90,
      });
      if (result.status === ScanDocumentResponseStatus.Cancel) return;
      const drafts: DraftScan[] = [];
      for (const uri of result.scannedImages ?? []) {
        const id = Crypto.randomUUID();
        try {
          drafts.push({ id, fileUri: await prepareScan(uri, id, true, "draft") });
        } catch {
          // An unreadable image: skip it rather than block the rest.
        }
      }
      if (drafts.length === 0) {
        if ((result.scannedImages ?? []).length > 0) Alert.alert(s.scan.failed);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const before = flowRef.current;
      if (before?.phase === "review") for (const d of before.drafts) deleteFile(d.fileUri);
      setFlow({ phase: "review", drafts });
    } catch {
      // No camera scanner here (the Simulator, or a refused camera): the
      // photo library still works.
      Alert.alert(s.scan.unavailable, undefined, [
        { text: s.common.cancel, style: "cancel" },
        { text: s.scan.fromPhotos, onPress: () => void pickPhotos() },
      ]);
    }
  }, [pickPhotos, setFlow]);

  // One receipt (the scan button, 2026-11-16): the iPhone's own camera. After
  // the shot iOS shows the photo full screen with Retake and Use Photo, so it
  // stays on screen until the person says it's good; then it is read on the
  // full screen with the scan line and its digital receipt opens. Apple's
  // document scanner instead shrinks each shot into a corner and waits for
  // the next page, which made people scan the same receipt twice.
  // Since 2026-11-19 the photo is cropped straight to the receipt on the
  // phone (modules/receipt-crop) when its edges are clear, so the original
  // shows the receipt, not the table; otherwise it is sent as taken.
  const scan = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(s.scan.cameraDenied, undefined, [
          { text: s.common.cancel, style: "cancel" },
          ...(permission.canAskAgain ? [] : [{ text: s.scan.openSettings, onPress: () => void Linking.openSettings() }]),
          { text: s.scan.fromPhotos, onPress: () => void pickPhotos() },
        ]);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
      if (result.canceled || result.assets.length === 0) return;
      const shot = result.assets[0].uri;
      const crop = await cropReceipt(shot);
      // The camera's file is in the app's caches: ours to remove, at once
      // when the crop replaces it, else once it is prepared for sending.
      if (crop.cropped) deleteFile(shot);
      const added = await enqueue([crop.uri], true);
      if (added.length === 1) {
        setFlow({ phase: "reading", ids: [added[0].id], images: [added[0].fileUri], cropped: crop.cropped });
      }
    } catch {
      // No camera here (the Simulator): the photo library still works.
      Alert.alert(s.scan.unavailable, undefined, [
        { text: s.common.cancel, style: "cancel" },
        { text: s.scan.fromPhotos, onPress: () => void pickPhotos() },
      ]);
    }
  }, [enqueue, pickPhotos, setFlow]);

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

  // The review's answers.
  const accepting = useRef(false);
  const acceptDrafts = useCallback(async () => {
    const f = flowRef.current;
    // A second tap while the files move would find them gone.
    if (f?.phase !== "review" || accepting.current) return;
    accepting.current = true;
    try {
      const added: PendingScan[] = [];
      for (const d of f.drafts) {
        try {
          const fileUri = await adoptDraft(d.fileUri, d.id);
          added.push({ id: d.id, fileUri, createdAt: new Date().toISOString(), state: "waiting", attempts: 0, retryAt: 0 });
        } catch {
          deleteFile(d.fileUri);
        }
      }
      if (added.length === 0) {
        setFlow(null);
        Alert.alert(s.scan.failed);
        return;
      }
      commit([...[...added].reverse(), ...queue.current]);
      pump();
      setFlow({ phase: "reading", ids: added.map((a) => a.id), images: added.map((a) => a.fileUri) });
    } finally {
      accepting.current = false;
    }
  }, [commit, pump, setFlow]);

  const removeDraft = useCallback(
    (id: string) => {
      const f = flowRef.current;
      if (f?.phase !== "review") return;
      const d = f.drafts.find((x) => x.id === id);
      if (d) deleteFile(d.fileUri);
      const left = withoutDraft(f.drafts, id);
      setFlow(left ? { phase: "review", drafts: left } : null);
    },
    [setFlow],
  );

  const closeFlow = useCallback(() => {
    const f = flowRef.current;
    // A review closed: those scans were never sent. Reading closed: the
    // scans go on in the list.
    if (f?.phase === "review") for (const d of f.drafts) deleteFile(d.fileUri);
    setFlow(null);
  }, [setFlow]);

  // What the reading screen shows; it moves on by itself.
  const view = useMemo(
    () => (flow?.phase === "reading" ? readingView(flow.ids, pending, saved) : null),
    [flow, pending, saved],
  );
  useEffect(() => {
    if (!view) return;
    if (view.kind === "open") {
      // Once per receipt, however often the queue changes meanwhile.
      if (opened.current === view.receiptId) return;
      opened.current = view.receiptId;
      // The digital receipt slides in under the reading screen, which then fades away.
      router.push({ pathname: "/receipt/[id]", params: { id: view.receiptId } });
      setTimeout(() => {
        if (flowRef.current?.phase === "reading") setFlow(null);
      }, 350);
      return;
    }
    if (view.kind === "done") setFlow(null);
  }, [view, setFlow]);

  // Signed out or another account: no screen of the last one stays open.
  useEffect(() => {
    setFlow(null);
    setSaved({});
  }, [userId, setFlow]);

  // One value per change of the queue: a new object every render made every
  // screen reading useScans() render again with each home refresh.
  const value = useMemo(
    () => ({ pending, scan, scanSeveral, pickPhotos, remove, retry }),
    [pending, scan, scanSeveral, pickPhotos, remove, retry],
  );
  return (
    <ScanContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {flow ? (
          <ScanFlowView
            flow={flow}
            view={view}
            onUse={() => void acceptDrafts()}
            onRetake={() => void scanSeveral()}
            onRemoveDraft={removeDraft}
            onClose={closeFlow}
            onRetakeStuck={(id) => {
              remove(id);
              void scan();
            }}
            onRemoveStuck={(id) => {
              remove(id);
              setFlow(null);
            }}
            onRetryStuck={retry}
          />
        ) : null}
      </View>
    </ScanContext.Provider>
  );
}

export function useScans(): ScanState {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScans outside ScanProvider");
  return ctx;
}
