// iOS-style grouped lists for the Account screens (Settings-like): a micro
// section title, a white card with hairline rows, a note under it. Rows
// spring under the finger like every tappable thing in the app.

import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { fonts, radius, space, makeStyles, useColors } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function Section({
  title,
  note,
  titleRef,
  children,
}: {
  title?: string;
  note?: string | null;
  /** For moving VoiceOver to the section (after its row went away). */
  titleRef?: React.Ref<React.ComponentRef<typeof View>>;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.section}>
      {title ? (
        <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={title}>
          <Text variant="micro" color={colors.inkMuted} style={styles.title}>
            {title}
          </Text>
        </View>
      ) : null}
      {children}
      {note ? <SectionNote text={note} /> : null}
    </View>
  );
}

/** A section's note, for when it belongs between two groups. */
export function SectionNote({ text, color }: { text: string; color?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Text variant="caption" color={color ?? colors.inkMuted} style={styles.note}>
      {text}
    </Text>
  );
}

/** The white card that holds rows. */
export function Group({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.group}>{children}</View>;
}

export function Row({
  label,
  detail,
  detailColor,
  value,
  onPress,
  chevron = Boolean(onPress),
  checked,
  busy = false,
  disabled = false,
  destructive = false,
  first = false,
  accessibilityHint,
  right,
}: {
  label: string;
  /** A second line under the label. */
  detail?: string | null;
  /** The second line's colour when it needs the user (honey). */
  detailColor?: string;
  /** On the right, before the chevron (iOS's "value" style). */
  value?: string | null;
  onPress?: () => void;
  chevron?: boolean;
  /** A checkmark list (currency): true shows the check. */
  checked?: boolean;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  /** The top row of a group has no line above it. */
  first?: boolean;
  accessibilityHint?: string;
  /** A control on the right instead of value/chevron (a Switch). */
  right?: React.ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const content = (
    <View style={[styles.row, !first && styles.divider]}>
      <View style={styles.texts}>
        <Text
          style={styles.label}
          color={destructive ? colors.negative : disabled ? colors.inkMuted : colors.ink}
        >
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color={detailColor ?? colors.inkMuted}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right ?? (
        <View style={styles.end}>
          {busy ? <ActivityIndicator color={colors.inkMuted} /> : null}
          {!busy && value ? (
            <Text variant="body" color={colors.inkMuted} numberOfLines={1} style={styles.value}>
              {value}
            </Text>
          ) : null}
          {!busy && checked ? (
            <SymbolView name="checkmark" size={16} weight="semibold" tintColor={colors.brandAction} />
          ) : null}
          {!busy && chevron ? (
            <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.inkFaint} />
          ) : null}
        </View>
      )}
    </View>
  );
  if (!onPress) {
    return (
      <View
        accessible={!right}
        accessibilityLabel={[label, detail, value].filter(Boolean).join(", ")}
        accessibilityState={checked !== undefined ? { selected: checked, disabled } : undefined}
      >
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      unstable_pressDelay={60}
      accessibilityRole="button"
      accessibilityLabel={[label, detail, value].filter(Boolean).join(", ")}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy, selected: checked }}
    >
      {content}
    </PressableScale>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: space.sm },
  title: { marginLeft: 4 },
  note: { marginHorizontal: 4 },
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: 14,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  texts: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  end: { flexDirection: "row", alignItems: "center", gap: space.sm, maxWidth: "55%" },
  value: { flexShrink: 1 },
}));
