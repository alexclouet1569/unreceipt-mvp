// "3 receipts to approve" at the top of the receipts list for an owner or an
// approver with something waiting (2026-11-15). Opens the To approve screen.
// A hairline card with a honey rule (it needs the user), no green: the scan
// button stays the screen's one green action.

import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { fill, s } from "../i18n";
import { fonts, radius, space, makeStyles, useColors } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function ToApproveCard({ count }: { count: number }) {
  const styles = useStyles();
  const colors = useColors();
  if (count <= 0) return null;
  const title = count === 1 ? s.approval.toApproveOne : fill(s.approval.toApproveMany, { count });
  return (
    <PressableScale
      onPress={() => {
        void Haptics.selectionAsync();
        router.push("/approvals");
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${s.approval.toApproveBody}`}
      style={styles.card}
    >
      <SymbolView name="checkmark.seal" size={18} weight="medium" tintColor={colors.attentionDeep} />
      <Text variant="caption" style={styles.label} numberOfLines={2}>
        {title}
      </Text>
      <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.inkMuted} />
    </PressableScale>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingHorizontal: space.md,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderLeftWidth: 3,
    borderLeftColor: colors.attention,
    backgroundColor: colors.card,
  },
  label: { flex: 1, fontFamily: fonts.semibold },
}));
