// The Insights tab: a native stack with a large title. A number opens the
// receipts behind it, and a receipt opens here too (same screens as in
// Receipts, src/lib/routes.ts), so the tab never jumps.

import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { UndoToast } from "../../../lib/ReceiptActions";
import { s } from "../../../i18n";
import { EDIT_DETENTS } from "../../../lib/edits";
import { fonts, radius, useColors } from "../../../theme";

export default function InsightsStack() {
  const colors = useColors();
  // A receipt deleted here gets the same Undo bar as in Receipts.
  return (
    <View style={styles.fill}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.surface },
          headerStyle: { backgroundColor: colors.surface },
          headerLargeStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          headerTintColor: colors.brandAction,
          headerTitleStyle: { fontFamily: fonts.bold, color: colors.ink },
          headerLargeTitleStyle: { fontFamily: fonts.bold, color: colors.ink },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ title: s.insights.title, headerLargeTitleEnabled: true }} />
        <Stack.Screen name="list" options={{ title: s.insights.listTitle }} />
        <Stack.Screen name="receipt/[id]" options={{ title: s.detail.title }} />
        <Stack.Screen
          name="receipt/edit"
          options={({ route }) => ({
            presentation: "formSheet",
            headerShown: false,
            sheetGrabberVisible: true,
            sheetCornerRadius: radius.xl,
            sheetAllowedDetents:
              EDIT_DETENTS[(route.params as { field?: keyof typeof EDIT_DETENTS } | undefined)?.field ?? "merchant"] ??
              EDIT_DETENTS.merchant,
            contentStyle: { backgroundColor: colors.surface },
          })}
        />
        <Stack.Screen
          name="receipt/photo"
          options={{ presentation: "modal", headerShown: false, contentStyle: { backgroundColor: colors.photoGround } }}
        />
      </Stack>
      <UndoToast />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
