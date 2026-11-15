// The Clients tab (accounting firm staff): a native stack. The client list,
// one client's month, and a client's receipt (the Receipts tab's own
// screens, src/lib/routes.ts), plus "Invite a client" and the firm's link as
// sheets.

import { Stack } from "expo-router";
import { s } from "../../../i18n";
import { EDIT_DETENTS } from "../../../lib/edits";
import { fonts, radius, useColors } from "../../../theme";

export default function ClientsStack() {
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
      {/* The bar's own title, as on Insights (a large title stayed blank there on iOS 26). */}
      <Stack.Screen name="index" options={{ title: s.firm.title }} />
      <Stack.Screen name="client/[orgId]" options={{ title: s.firm.title }} />
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
      <Stack.Screen
        name="invite"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetGrabberVisible: true,
          sheetCornerRadius: radius.xl,
          sheetAllowedDetents: [0.6, 0.9],
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="link"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetGrabberVisible: true,
          sheetCornerRadius: radius.xl,
          sheetAllowedDetents: [0.85],
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
    </Stack>
  );
}
