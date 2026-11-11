// A calm full screen for accounts the app can't show receipts for: firm-only
// staff (the portal is on the web) and accounts without an active plan.
// No price, no plan, no purchase link (App Store 3.1.3(f)). Deleting the
// account stays reachable here too (App Store 5.1.1(v)).

import { useState } from "react";
import { Alert, Modal, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { fill, s } from "../i18n";
import { useScans } from "../lib/scans/ScanProvider";
import { colors, space } from "../theme";
import { BrandMark } from "./Brand";
import { Button } from "./Button";
import { DeleteAccount } from "./DeleteAccount";
import { Text } from "./Text";

export function StatusScreen({ title, body }: { title: string; body: string }) {
  const { email, signOut } = useAuth();
  const { pending } = useScans();
  const unsent = pending.filter((p) => p.state !== "notReceipt").length;
  const [deleting, setDeleting] = useState(false);
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
          <Text variant="caption" color={colors.inkMuted} style={styles.center}>
            {s.account.signedInAs} {email}
          </Text>
        ) : null}
      </View>
      <Button
        label={s.account.signOut}
        kind="destructive"
        onPress={() =>
          Alert.alert(s.account.signOutConfirm, unsent > 0 ? fill(s.account.signOutPending, { count: unsent }) : undefined, [
            { text: s.common.cancel, style: "cancel" },
            { text: s.account.signOut, style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
      <Button label={s.account.deleteAccount} kind="destructive" onPress={() => setDeleting(true)} />
      {/* A page sheet, swiped down to close, like the account tab's push. */}
      <Modal
        visible={deleting}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDeleting(false)}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text variant="bodyLg" accessibilityRole="header">
              {s.deletion.title}
            </Text>
            <Button label={s.common.cancel} kind="plain" onPress={() => setDeleting(false)} />
          </View>
          <DeleteAccount />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: space.xl },
  middle: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.lg },
  center: { textAlign: "center" },
  sheet: { flex: 1, backgroundColor: colors.surface },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: space.lg,
    paddingTop: space.sm,
  },
});
