// Under an export: its message (honey for a problem, muted otherwise) and,
// when the ZIP came in several parts, one Share row per part.

import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { fill, s } from "../i18n";
import type { ExportState } from "../lib/useExport";
import { durations, space, useColors } from "../theme";
import { Group, Row } from "./Grouped";
import { Text } from "./Text";

export function ExportResult({ state }: { state: ExportState }) {
  const colors = useColors();
  if (!state.message && state.parts.length === 0) return null;
  return (
    <Animated.View entering={FadeIn.duration(durations.short)} style={styles.wrap}>
      {state.message ? (
        <Text variant="caption" color={state.warn ? colors.attentionDeep : colors.inkMuted}>
          {state.message}
        </Text>
      ) : null}
      {state.parts.length > 1 ? (
        <Group>
          {state.parts.map((p, i) => (
            <Row
              key={p.uri}
              first={i === 0}
              label={fill(s.exporting.part, { n: i + 1, count: state.parts.length })}
              value={s.exporting.share}
              onPress={() => void state.share(p.uri)}
            />
          ))}
        </Group>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
