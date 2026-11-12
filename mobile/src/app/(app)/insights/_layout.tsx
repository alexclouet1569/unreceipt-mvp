// The Insights tab: a native stack with the title in the bar. A number opens the
// receipts behind it, and a receipt opens here too (same screens as in
// Receipts, src/lib/routes.ts), so the tab never jumps.
//
// The Stack is the tab's direct child, as in Account: wrapped in a View
// (it used to be, for the Undo bar) the large title stayed blank on iOS 26.
// The Undo bar lives in the list screen instead, where a delete lands.

import { Stack } from "expo-router";
import { s } from "../../../i18n";
import { EDIT_DETENTS } from "../../../lib/edits";
import { fonts, radius, useColors } from "../../../theme";

export default function InsightsStack() {
  const colors = useColors();
  return (
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
      {/* The bar's own title, not a large one: the large title stayed blank
          on Insights on a real iPhone (2026-11-12) while the bar's title
          draws everywhere else in the app. */}
      <Stack.Screen name="index" options={{ title: s.insights.title }} />
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
  );
}
