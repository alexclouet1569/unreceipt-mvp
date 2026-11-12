// The receipts behind a number on the Insights screen (a category, a
// merchant, a finding): asked from the server, so older receipts than the
// home list's 50 are there too. Tapping one opens it in this tab.

import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { MobileReceipt } from "@/lib/mobile/types";
import { ReceiptRow } from "../../../components/ReceiptRow";
import { ReceiptSkeleton } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { s } from "../../../i18n";
import { ApiError, getAnalyticsReceipts } from "../../../lib/api";
import { useHome } from "../../../lib/HomeProvider";
import { space, useColors } from "../../../theme";

export default function InsightsList() {
  const colors = useColors();
  const { q, title } = useLocalSearchParams<{ q: string; title?: string }>();
  const { home, extra, rememberReceipts } = useHome();
  const [ids, setIds] = useState<string[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await getAnalyticsReceipts(q ?? "");
      rememberReceipts(res.receipts);
      setIds(res.receipts.map((r) => r.id));
      setTruncated(res.truncated);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.insights.loadFailed);
    } finally {
      setRefreshing(false);
    }
  }, [q, rememberReceipts]);

  useEffect(() => {
    void load();
  }, [load]);

  // The list's copy when there is one (it carries the phone's edits), else
  // the one fetched here; a deleted receipt drops out.
  const list = home?.state === "ready" ? home.receipts : [];
  const receipts = (ids ?? [])
    .map((id) => list.find((r) => r.id === id) ?? extra.find((r) => r.id === id))
    .filter((r): r is MobileReceipt => r != null);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing && ids != null} onRefresh={() => void load()} tintColor={colors.inkMuted} />}
    >
      <Stack.Screen options={{ title: title || s.insights.listTitle }} />
      {error ? (
        <Text variant="caption" color={colors.attentionDeep} style={styles.note}>
          {error}
        </Text>
      ) : null}
      {ids == null && !error ? <ReceiptSkeleton rows={5} /> : null}
      {ids != null && receipts.length === 0 ? (
        <Text variant="body" color={colors.inkMuted} style={styles.note}>
          {s.insights.listEmpty}
        </Text>
      ) : null}
      <View style={styles.list}>
        {receipts.map((r) => (
          <ReceiptRow
            key={r.id}
            receipt={r}
            onPress={() => router.push({ pathname: "/insights/receipt/[id]", params: { id: r.id } })}
          />
        ))}
      </View>
      {truncated ? (
        <Text variant="caption" color={colors.inkMuted} style={styles.note}>
          {s.insights.truncated}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxxl },
  list: { marginTop: space.lg },
  note: { marginHorizontal: space.lg, marginTop: space.lg },
});
