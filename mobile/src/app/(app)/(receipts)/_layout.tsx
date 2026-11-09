// The Receipts tab: a native stack with the large iOS title that shrinks
// into the bar as you scroll; a receipt slides in from the right and swipes
// back with the thumb.

import { Stack } from "expo-router";
import { s } from "../../../i18n";
import { colors, fonts } from "../../../theme";

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
        headerLargeTitleStyle: { fontFamily: fonts.extrabold, color: colors.ink },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: s.receipts.title, headerLargeTitleEnabled: true }} />
      <Stack.Screen name="receipt/[id]" options={{ title: s.detail.title }} />
    </Stack>
  );
}
