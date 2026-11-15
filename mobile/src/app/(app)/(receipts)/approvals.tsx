// To approve (2026-11-15): the receipts colleagues sent to the signed-in
// owner or approver, oldest first (GET /api/team/approvals). Each card: who
// sent it, merchant, amount, date, who paid, the original one tap away;
// Approve, or Send back / Reject with a reason (iOS's own text prompt).
// A decided card leaves the list; pull down to load again.

import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Alert, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeOut } from "react-native-reanimated";
import type { ApprovalQueueItem } from "@/lib/mobile/types";
import { Button } from "../../../components/Button";
import { Money } from "../../../components/Money";
import { Text } from "../../../components/Text";
import { locale, s } from "../../../i18n";
import { ApiError, decideOnReceipt, getApprovalQueue } from "../../../lib/api";
import { parseReceiptDate, shortDate } from "../../../lib/format";
import { useHome } from "../../../lib/HomeProvider";
import { durations, fonts, radius, space, makeStyles, useColors } from "../../../theme";

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; items: ApprovalQueueItem[] };

export default function Approvals() {
  const styles = useStyles();
  const colors = useColors();
  const { refresh: refreshHome } = useHome();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const { items } = await getApprovalQueue();
      setLoad({ status: "ready", items });
    } catch {
      setLoad((l) => (l.status === "ready" ? l : { status: "failed" }));
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const decide = async (id: string, decision: "approve" | "send_back" | "reject", comment: string | null) => {
    setBusy(id);
    try {
      const res = await decideOnReceipt(id, decision, comment);
      // 409: decided by someone else meanwhile; either way it no longer waits.
      if (res.ok || res.status === 409) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        AccessibilityInfo.announceForAccessibility(s.approval.decided);
        setLoad((l) => (l.status === "ready" ? { status: "ready", items: l.items.filter((i) => i.receipt.id !== id) } : l));
        void refreshHome();
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(res.code === "comment_required" ? s.approval.commentNeeded : s.approval.decideFailed);
      }
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.approval.decideFailed);
    } finally {
      setBusy(null);
    }
  };

  const askWhy = (id: string, decision: "send_back" | "reject") => {
    Alert.prompt(
      decision === "send_back" ? s.approval.sendBackTitle : s.approval.rejectTitle,
      undefined,
      [
        { text: s.common.cancel, style: "cancel" },
        {
          text: decision === "send_back" ? s.approval.sendBack : s.approval.reject,
          style: decision === "reject" ? "destructive" : "default",
          onPress: (text?: string) => {
            const why = (text ?? "").trim();
            if (!why) return Alert.alert(s.approval.commentNeeded);
            void decide(id, decision, why);
          },
        },
      ],
      "plain-text",
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchQueue();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      {load.status === "loading" ? (
        <View style={styles.skeleton} accessibilityElementsHidden />
      ) : load.status === "failed" ? (
        <Text variant="body" color={colors.attentionDeep} accessibilityRole="alert">
          {s.approval.loadFailed}
        </Text>
      ) : load.items.length === 0 ? (
        <Text variant="body" color={colors.inkMuted}>
          {s.approval.empty}
        </Text>
      ) : (
        load.items.map(({ receipt: r, employee }) => {
          const date = parseReceiptDate(r.date);
          const paid = r.approval?.paidBy === "company" ? s.approval.paidByCompany : s.approval.toPayBack;
          return (
            <Animated.View key={r.id} exiting={FadeOut.duration(durations.short)} style={styles.card}>
              <View style={styles.top}>
                <View style={styles.middle}>
                  <Text variant="caption" color={colors.inkMuted} style={styles.semibold} numberOfLines={1}>
                    {employee}
                  </Text>
                  <Text variant="merchant" numberOfLines={2}>
                    {r.merchant ?? "—"}
                  </Text>
                  <Text variant="caption" color={colors.inkMuted}>
                    {[date ? shortDate(date, locale) : s.approval.noDate, paid].join(" · ")}
                  </Text>
                  {r.notes ? (
                    <Text variant="caption" color={colors.ink} numberOfLines={3}>
                      {r.notes}
                    </Text>
                  ) : null}
                </View>
                <Money amount={r.total} currency={r.currency} />
              </View>
              <Button
                label={s.approval.approve}
                kind="ink"
                busy={busy === r.id}
                disabled={busy !== null}
                onPress={() => void decide(r.id, "approve", null)}
              />
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Button label={s.approval.sendBack} kind="outline" disabled={busy !== null} onPress={() => askWhy(r.id, "send_back")} />
                </View>
                <View style={styles.cell}>
                  <Button label={s.approval.reject} kind="destructive" disabled={busy !== null} onPress={() => askWhy(r.id, "reject")} />
                </View>
              </View>
              {r.original === "image" || r.original === "pdf" ? (
                <Button
                  label={s.approval.original}
                  kind="plain"
                  onPress={() =>
                    router.push({
                      pathname: "/receipt/photo",
                      params: r.original === "pdf" ? { id: r.id, page: "1" } : { id: r.id },
                    })
                  }
                />
              ) : null}
            </Animated.View>
          );
        })
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.md },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  middle: { flex: 1, gap: 2 },
  semibold: { fontFamily: fonts.semibold },
  row: { flexDirection: "row", gap: space.sm },
  cell: { flex: 1 },
  skeleton: { height: 180, borderRadius: radius.lg, backgroundColor: colors.skeleton },
}));
