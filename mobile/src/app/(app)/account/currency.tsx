// The company's currency, as a checkmark list (iOS Settings style). A tap
// saves at once through the website's /api/organization/currency; the
// receipts list then refreshes, because totals and conversions follow it.
// Only an owner can change it (the server checks again).

import { useState } from "react";
import { AccessibilityInfo, Alert, ScrollView, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Group, Row, Section } from "../../../components/Grouped";
import { s } from "../../../i18n";
import { ApiError, setCurrency } from "../../../lib/api";
import { useAccount } from "../../../lib/AccountProvider";
import { useHome } from "../../../lib/HomeProvider";
import { space } from "../../../theme";

export default function CurrencyScreen() {
  const { account, refresh } = useAccount();
  const home = useHome();
  const [saving, setSaving] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const currency = account?.currency;
  if (!currency) return null;
  const current = chosen ?? currency.value;

  const choose = async (code: string) => {
    if (code === current || saving) return;
    void Haptics.selectionAsync();
    setSaving(code);
    setChosen(code);
    try {
      const res = await setCurrency(code);
      if (!res.ok) {
        setChosen(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(res.status === 403 ? s.currencyScreen.ownerOnly : s.currencyScreen.failed);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AccessibilityInfo.announceForAccessibility(s.currencyScreen.saved);
      await Promise.all([refresh(), home.refresh()]);
      setChosen(null);
    } catch (err) {
      setChosen(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.currencyScreen.failed);
    } finally {
      setSaving(null);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Section note={currency.canChange ? s.currencyScreen.intro : `${s.currencyScreen.ownerOnly} ${s.currencyScreen.intro}`}>
        <Group>
          {currency.options.map((code, i) => (
            <Row
              key={code}
              first={i === 0}
              label={code}
              checked={code === current}
              busy={saving === code}
              chevron={false}
              disabled={!currency.canChange}
              onPress={currency.canChange ? () => void choose(code) : undefined}
            />
          ))}
        </Group>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xl },
});
