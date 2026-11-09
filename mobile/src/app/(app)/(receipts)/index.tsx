// The home screen: what needs the user first, then every receipt by day.
// Opens on the saved list at once, refreshes in the background, pull down to
// refresh by hand.

import { useMemo } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { BrandMark } from "../../../components/Brand";
import { Button } from "../../../components/Button";
import { ForwardingCard } from "../../../components/ForwardingCard";
import { ReceiptRow } from "../../../components/ReceiptRow";
import { ReceiptSkeleton } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { locale, s } from "../../../i18n";
import { useHome } from "../../../lib/HomeProvider";
import { buildSections } from "../../../lib/sections";
import { colors, radius, space } from "../../../theme";

function Notice({ text }: { text: string }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.notice}>
      <Text variant="caption" color={colors.attentionDeep}>
        {text}
      </Text>
    </Animated.View>
  );
}

function Empty({ address }: { address: string }) {
  return (
    <Animated.View entering={FadeIn.duration(320)} style={styles.empty}>
      <View style={styles.emptyMark}>
        <BrandMark size={44} />
      </View>
      <Text variant="displayLg" style={styles.center}>
        {s.receipts.emptyTitle}
      </Text>
      <Text variant="body" color={colors.inkMuted} style={styles.center}>
        {s.receipts.emptyBody}
      </Text>
      <View style={styles.emptyCard}>
        <ForwardingCard address={address} />
      </View>
    </Animated.View>
  );
}

export default function Receipts() {
  const { home, error, refreshing, loading, refresh } = useHome();
  const receipts = home?.state === "ready" ? home.receipts : null;
  const sections = useMemo(
    () => (receipts ? buildSections(receipts, s, locale) : []),
    [receipts],
  );

  if (!home && loading) {
    return (
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={[]}
        renderItem={() => null}
        ListHeaderComponent={<ReceiptSkeleton />}
      />
    );
  }

  if (!home || home.state !== "ready") {
    return (
      <View style={styles.failed}>
        <Text variant="body" color={colors.inkMuted} style={styles.center}>
          {error === "offline" ? s.common.unreachable : s.receipts.loadFailed}
        </Text>
        <Button label={s.common.retry} onPress={() => void refresh()} busy={refreshing} />
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(320)} style={styles.fill}>
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing && !loading} onRefresh={() => void refresh()} tintColor={colors.inkFaint} />
        }
        ListHeaderComponent={
          error ? <Notice text={error === "offline" ? s.common.offline : s.receipts.loadFailed} /> : undefined
        }
        ListEmptyComponent={<Empty address={home.forwardingEmail} />}
        renderSectionHeader={({ section }) => (
          <Text
            variant="micro"
            color={section.attention ? colors.attentionDeep : colors.inkFaint}
            style={styles.sectionLabel}
            accessibilityRole="header"
          >
            {`${section.title.toUpperCase()}${section.attention ? `  ${section.data.length}` : ""}`}
          </Text>
        )}
        renderItem={({ item }) => (
          <ReceiptRow
            receipt={item}
            onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: item.id } })}
          />
        )}
        contentContainerStyle={styles.content}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space.xxxl },
  center: { textAlign: "center" },
  sectionLabel: {
    marginHorizontal: space.lg,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  notice: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.attentionTint,
  },
  empty: { paddingHorizontal: space.xl, paddingTop: space.xxl, alignItems: "center", gap: space.md },
  emptyMark: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  emptyCard: { alignSelf: "stretch", marginTop: space.md },
  failed: { flex: 1, justifyContent: "center", padding: space.xl, gap: space.lg },
});
