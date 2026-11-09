// A calm full screen for accounts the app can't show receipts for: firm-only
// staff (the portal is on the web) and accounts without an active plan.
// No price, no plan, no purchase link (App Store 3.1.3(f)).

import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { s } from "../i18n";
import { colors, space } from "../theme";
import { BrandMark } from "./Brand";
import { Button } from "./Button";
import { Text } from "./Text";

export function StatusScreen({ title, body }: { title: string; body: string }) {
  const { email, signOut } = useAuth();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.middle}>
        <BrandMark size={64} />
        <Text variant="displayLg" style={styles.center}>
          {title}
        </Text>
        <Text variant="body" color={colors.inkMuted} style={styles.center}>
          {body}
        </Text>
        {email ? (
          <Text variant="caption" color={colors.inkFaint} style={styles.center}>
            {s.account.signedInAs} {email}
          </Text>
        ) : null}
      </View>
      <Button label={s.account.signOut} kind="plain" onPress={() => void signOut()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: space.xl },
  middle: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.lg },
  center: { textAlign: "center" },
});
