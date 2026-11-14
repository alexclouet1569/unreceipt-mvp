// "2 new receipts from your email · Review" at the top of the receipts list
// (the website's NewReceiptsNotice). The list is sorted by each receipt's
// printed date, so one dated last week that arrives today lands mid-list
// and is easy to miss: Review opens the newest one; back on the list the
// card counts the rest, so Review again walks through them. × counts them
// all as seen. The data comes from HomeProvider's foreground polling.

import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { fill, s } from "../i18n";
import { useHome } from "../lib/HomeProvider";
import { durations, fonts, radius, space, makeStyles, useColors } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function NewReceiptsCard() {
  const styles = useStyles();
  const colors = useColors();
  const { newReceipts } = useHome();
  const count = newReceipts.items.length;
  if (count === 0) return null;
  const label = count === 1 ? s.receipts.newFromEmailOne : fill(s.receipts.newFromEmailMany, { count });
  const review = () => {
    const id = newReceipts.items[0].id;
    void Haptics.selectionAsync();
    newReceipts.open(id);
    router.push({ pathname: "/receipt/[id]", params: { id } });
  };
  return (
    <Animated.View
      entering={FadeIn.duration(durations.short)}
      exiting={FadeOut.duration(durations.short)}
      style={styles.card}
      accessibilityLiveRegion="polite"
    >
      <SymbolView name="envelope" size={17} weight="medium" tintColor={colors.brandAction} />
      <Text variant="caption" style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <PressableScale scaleTo={0.94} onPress={review} accessibilityRole="button" accessibilityLabel={`${s.receipts.newReview}, ${label}`} style={styles.review}>
        <Text variant="caption" style={styles.reviewText} color={colors.brandAction}>
          {s.receipts.newReview}
        </Text>
      </PressableScale>
      <PressableScale scaleTo={0.9} onPress={newReceipts.dismiss} accessibilityRole="button" accessibilityLabel={s.receipts.newHide} style={styles.close}>
        <SymbolView name="xmark" size={13} weight="semibold" tintColor={colors.inkMuted} />
      </PressableScale>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingLeft: space.md,
    paddingRight: space.xs,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  label: { flex: 1, fontFamily: fonts.semibold },
  review: { minHeight: 44, minWidth: 44, paddingHorizontal: space.sm, alignItems: "center", justifyContent: "center" },
  reviewText: { fontFamily: fonts.bold, fontSize: 15 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));
