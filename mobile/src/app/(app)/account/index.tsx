// Account: who is signed in, the receipt address, the language, sign out.
// Account deletion (App Store 5.1.1(v)) and the accountant link come in
// phase 3 (docs/plans/unreceipt-ios-native-plan.md).

import { Alert, ScrollView, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "../../../auth/AuthProvider";
import { Button } from "../../../components/Button";
import { ForwardingCard } from "../../../components/ForwardingCard";
import { Text } from "../../../components/Text";
import { fill, s } from "../../../i18n";
import { useHome } from "../../../lib/HomeProvider";
import { colors, radius, space } from "../../../theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="micro" color={colors.inkMuted} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function Account() {
  const { email, signOut } = useAuth();
  const { home } = useHome();

  const confirmSignOut = () =>
    Alert.alert(s.account.signOutConfirm, undefined, [
      { text: s.common.cancel, style: "cancel" },
      { text: s.account.signOut, style: "destructive", onPress: () => void signOut() },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Section title={s.account.signedInAs}>
        <View style={styles.card}>
          <Text variant="merchant">{email}</Text>
        </View>
      </Section>

      {home?.state === "ready" ? (
        <Section title={s.account.forwardingTitle}>
          <ForwardingCard address={home.forwardingEmail} />
          <Text variant="caption" color={colors.inkMuted}>
            {s.account.forwardingBody}
          </Text>
        </Section>
      ) : null}

      <Section title={s.account.language}>
        <Text variant="caption" color={colors.inkMuted}>
          {s.account.languageNote}
        </Text>
      </Section>

      <View style={styles.signOut}>
        <Button label={s.account.signOut} kind="destructive" onPress={confirmSignOut} />
        <Text variant="caption" color={colors.inkFaint} style={styles.center}>
          {fill(s.account.version, { version: Constants.expoConfig?.version ?? "" })}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xl },
  section: { gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  signOut: { marginTop: space.lg, gap: space.sm },
  center: { textAlign: "center" },
});
