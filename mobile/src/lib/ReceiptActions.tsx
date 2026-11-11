// What the user does to a receipt: save a field, confirm it, delete it.
// Every action shows on screen at once and is undone if the server says no.
// A delete waits 5 seconds behind an "Undo" bar (as the website's swipe to
// delete, DESIGN.md "Swipe to delete") and is sent at once if the app goes
// to the background, so it is never lost.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { HostInstance } from "react-native";
import { AccessibilityInfo, Alert, AppState, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-screens/experimental";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import type { MobileReceipt } from "@/lib/mobile/types";
import { PressableScale } from "../components/PressableScale";
import { Text } from "../components/Text";
import { fill, s } from "../i18n";
import { SCAN_BUTTON_SPACE } from "../components/ScanButton";
import { colors, durations, fonts, radius, space } from "../theme";
import { ApiError, apiResponse } from "./api";
import { applyPatch, type ReceiptPatch } from "./edits";
import { useHome } from "./HomeProvider";

const UNDO_MS = 5_000;
// With VoiceOver, finding Undo takes longer (WCAG 2.2.1).
const UNDO_MS_SCREEN_READER = 15_000;

type Actions = {
  /** Saves fields; true when the server kept them. An empty patch confirms. */
  save: (id: string, patch: ReceiptPatch) => Promise<boolean>;
  /** Confirms at once on the phone; the server is asked behind it and a refusal undoes it. */
  confirm: (id: string) => void;
  remove: (id: string) => void;
  /** The Undo bar's text while a delete can still be undone. */
  toast: string | null;
  undo: () => void;
};

type PendingDelete = { receipt: MobileReceipt; index: number; timer: ReturnType<typeof setTimeout> };

const ActionsContext = createContext<Actions | null>(null);

export function ReceiptActionsProvider({ children }: { children: React.ReactNode }) {
  const { home, mutateReceipts, refresh } = useHome();
  const [toast, setToast] = useState<string | null>(null);
  const deleting = useRef<PendingDelete | null>(null);
  const receipts = home?.state === "ready" ? home.receipts : [];
  const latest = useRef(receipts);
  latest.current = receipts;

  const save = useCallback(
    async (id: string, patch: ReceiptPatch) => {
      const before = latest.current.find((r) => r.id === id);
      if (!before) return false;
      mutateReceipts((rs) => rs.map((r) => (r.id === id ? applyPatch(r, patch, r.status) : r)));
      try {
        const res = await apiResponse(`/api/receipts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        const body = (await res.json().catch(() => null)) as { status?: MobileReceipt["status"] } | null;
        if (!res.ok || !body?.status) throw new ApiError("server");
        const status = body.status;
        mutateReceipts((rs) => rs.map((r) => (r.id === id ? applyPatch(r, patch, status) : r)));
        // The server's full row (conversions) a moment later.
        setTimeout(() => void refresh(), 1_000);
        return true;
      } catch {
        mutateReceipts((rs) => rs.map((r) => (r.id === id ? before : r)));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(s.edit.saveFailed);
        return false;
      }
    },
    [mutateReceipts, refresh],
  );

  const confirm = useCallback(
    (id: string) => {
      const before = latest.current.find((r) => r.id === id);
      if (!before) return;
      // Confirmed on screen now (the button never spins); an empty PATCH
      // tells the server, which answers with the status it keeps.
      mutateReceipts((rs) => rs.map((r) => (r.id === id ? { ...r, status: "verified" } : r)));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AccessibilityInfo.announceForAccessibility(s.edit.confirmed);
      void (async () => {
        try {
          const res = await apiResponse(`/api/receipts/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify({}),
          });
          const body = (await res.json().catch(() => null)) as { status?: MobileReceipt["status"] } | null;
          if (!res.ok || !body?.status) throw new ApiError("server");
          const status = body.status;
          mutateReceipts((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
          setTimeout(() => void refresh(), 1_000);
        } catch {
          mutateReceipts((rs) => rs.map((r) => (r.id === id ? before : r)));
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(s.edit.saveFailed);
        }
      })();
    },
    [mutateReceipts, refresh],
  );

  const sendDelete = useCallback(
    async (pending: PendingDelete) => {
      if (deleting.current === pending) {
        deleting.current = null;
        setToast(null);
      }
      try {
        const res = await apiResponse(`/api/receipts/${encodeURIComponent(pending.receipt.id)}`, { method: "DELETE" });
        // Already gone counts as deleted.
        if (!res.ok && res.status !== 404) throw new ApiError("server");
      } catch {
        mutateReceipts((rs) => {
          const next = [...rs];
          next.splice(Math.min(pending.index, next.length), 0, pending.receipt);
          return next;
        });
        Alert.alert(s.edit.deleteFailed);
      }
    },
    [mutateReceipts],
  );

  const remove = useCallback(
    (id: string) => {
      const index = latest.current.findIndex((r) => r.id === id);
      if (index === -1) return;
      // One Undo at a time: a second delete sends the first now.
      if (deleting.current) {
        clearTimeout(deleting.current.timer);
        void sendDelete(deleting.current);
      }
      const receipt = latest.current[index];
      mutateReceipts((rs) => rs.filter((r) => r.id !== id));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const pending: PendingDelete = { receipt, index, timer: setTimeout(() => void sendDelete(pending), UNDO_MS) };
      deleting.current = pending;
      void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
        if (!on || deleting.current !== pending) return;
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => void sendDelete(pending), UNDO_MS_SCREEN_READER);
      });
      const message = receipt.merchant ? fill(s.edit.deletedNamed, { merchant: receipt.merchant }) : s.edit.deleted;
      setToast(message);
      AccessibilityInfo.announceForAccessibility(message);
    },
    [mutateReceipts, sendDelete],
  );

  const undo = useCallback(() => {
    const pending = deleting.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    deleting.current = null;
    setToast(null);
    mutateReceipts((rs) => {
      const next = [...rs];
      next.splice(Math.min(pending.index, next.length), 0, pending.receipt);
      return next;
    });
    void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(s.edit.restored);
  }, [mutateReceipts]);

  // Leaving the app ends the Undo window: send the delete now.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const pending = deleting.current;
      if (state !== "active" && pending) {
        clearTimeout(pending.timer);
        void sendDelete(pending);
      }
    });
    return () => sub.remove();
  }, [sendDelete]);

  // One value object per change, so screens using it don't re-render for nothing.
  const value = useMemo(() => ({ save, confirm, remove, toast, undo }), [save, confirm, remove, toast, undo]);
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

/**
 * The Undo bar, just above the scan button. Rendered by the Receipts screen,
 * inside the tab, so it sits above the tab bar (that screen's SafeAreaView
 * knows the bar's height). VoiceOver focus moves to Undo when it appears.
 */
export function UndoToast() {
  const { toast, undo } = useReceiptActions();
  const undoRef = useRef<HostInstance>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      if (undoRef.current) AccessibilityInfo.sendAccessibilityEvent(undoRef.current, "focus");
    }, 300);
    return () => clearTimeout(t);
  }, [toast]);

  // The wrapper stays mounted so the bar's exit animation can play.
  return (
    <SafeAreaView edges={{ bottom: true }} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.place} pointerEvents="box-none">
        {toast ? (
          <Animated.View
            entering={FadeInDown.duration(durations.short)}
            exiting={FadeOutDown.duration(durations.short)}
            style={styles.toast}
          >
            <Text variant="body" color={colors.white} style={styles.toastText} numberOfLines={2}>
              {toast}
            </Text>
            <View ref={undoRef} collapsable={false}>
              <PressableScale
                scaleTo={0.94}
                onPress={undo}
                accessibilityRole="button"
                accessibilityLabel={s.edit.undo}
                hitSlop={8}
                style={styles.undo}
              >
                {/* --brand, not --brand-action: 4.8:1 on ink, where
                    --brand-action is 2.3:1 (DESIGN.md, native app). */}
                <Text style={styles.undoLabel} color={colors.brand}>
                  {s.edit.undo}
                </Text>
              </PressableScale>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

export function useReceiptActions(): Actions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useReceiptActions outside ReceiptActionsProvider");
  return ctx;
}

const styles = StyleSheet.create({
  place: { flex: 1, justifyContent: "flex-end", paddingHorizontal: space.lg, paddingBottom: SCAN_BUTTON_SPACE },
  toast: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space.lg,
    paddingRight: space.sm,
  },
  toastText: { flex: 1, fontFamily: fonts.semibold },
  undo: { minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md },
  undoLabel: { fontFamily: fonts.bold, fontSize: 15 },
});
