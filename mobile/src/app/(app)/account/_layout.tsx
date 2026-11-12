import { Stack } from "expo-router";
import { s } from "../../../i18n";
import { fonts, useColors } from "../../../theme";

export default function AccountStack() {
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
      <Stack.Screen name="index" options={{ title: s.account.title, headerLargeTitleEnabled: true }} />
      <Stack.Screen name="forwarding" options={{ title: s.forwarding.title, headerLargeTitleEnabled: true }} />
      <Stack.Screen name="guide" options={{ title: s.forwarding.title }} />
      <Stack.Screen name="export" options={{ title: s.exporting.title, headerLargeTitleEnabled: true }} />
      <Stack.Screen name="currency" options={{ title: s.currencyScreen.title, headerLargeTitleEnabled: true }} />
      <Stack.Screen name="accountant" options={{ title: s.accountant.title, headerLargeTitleEnabled: true }} />
      <Stack.Screen name="delete" options={{ title: s.deletion.title, headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
