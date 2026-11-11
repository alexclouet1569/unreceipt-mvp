// The Receipts tab: a native stack with the UnReceipt wordmark in the bar
// (like the website's header); a receipt slides in from the right and
// swipes back with the thumb.

import { Stack } from "expo-router";
import { HeaderBrand } from "../../../components/Brand";
import { s } from "../../../i18n";
import { colors, fonts, radius } from "../../../theme";
import { EDIT_DETENTS } from "../../../lib/edits";

export default function ReceiptsStack() {
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
      {/* The website's header: the UnReceipt wordmark on top; "Your receipts"
          and the email open the list below it. */}
      <Stack.Screen name="index" options={{ title: s.receipts.title, headerTitle: () => <HeaderBrand /> }} />
      <Stack.Screen name="receipt/[id]" options={{ title: s.detail.title }} />
      {/* A field is edited in iOS's own bottom sheet, dragged away to cancel. */}
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
      {/* The photo full screen, pinch to zoom, swipe down to close. */}
      <Stack.Screen
        name="receipt/photo"
        options={{ presentation: "modal", headerShown: false, contentStyle: { backgroundColor: colors.ink } }}
      />
    </Stack>
  );
}
