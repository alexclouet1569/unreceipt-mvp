// Export receipts: tap a month, a year or everything; the server builds the
// ZIP and the share sheet opens with it (send it to the accountant, save it
// in Files). The website's ExportPanel, one tap per period.

import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ExportResult } from "../../../components/ExportResult";
import { Group, Row, Section } from "../../../components/Grouped";
import { Text } from "../../../components/Text";
import { locale, s } from "../../../i18n";
import { useAccount } from "../../../lib/AccountProvider";
import { exportPeriods } from "../../../lib/export-periods";
import { useExport } from "../../../lib/useExport";
import { colors, space } from "../../../theme";

export default function ExportScreen() {
  const { account } = useAccount();
  const exporter = useExport();
  const { months, years } = useMemo(() => exportPeriods(account?.firstMonth ?? null, locale), [account?.firstMonth]);

  const row = (key: string, label: string, i: number) => (
    <Row
      key={key}
      first={i === 0}
      label={label}
      busy={exporter.busy === key}
      disabled={exporter.busy !== null && exporter.busy !== key}
      chevron={false}
      value={exporter.busy === key ? s.exporting.working : null}
      onPress={() => void exporter.run(key, label)}
    />
  );

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text variant="body" color={colors.inkMuted}>
        {s.exporting.intro}
      </Text>
      <ExportResult state={exporter} />
      <Section title={s.exporting.months}>
        <Group>{months.map((p, i) => row(p.key, p.label, i))}</Group>
      </Section>
      <Section title={s.exporting.years}>
        <Group>{years.map((p, i) => row(p.key, p.label, i))}</Group>
      </Section>
      <View>
        <Group>{row("all", s.exporting.everything, 0)}</Group>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xl },
});
