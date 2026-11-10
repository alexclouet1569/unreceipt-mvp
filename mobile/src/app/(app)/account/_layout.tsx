import { Stack } from "expo-router";
import { s } from "../../../i18n";
import { colors, fonts } from "../../../theme";

export default function AccountStack() {
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
      }}
    >
      <Stack.Screen name="index" options={{ title: s.account.title, headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
