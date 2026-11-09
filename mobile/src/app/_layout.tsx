// The app's root: fonts, the splash screen, and the split between signed-in
// screens ((app): tabs) and the two sign-in screens. Stack.Protected swaps
// them by itself when the session appears or goes away.

import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
// One import per weight, so only these files ship in the app.
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { Figtree_500Medium_Italic } from "@expo-google-fonts/figtree/500Medium_Italic";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { colors } from "../theme";

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 250, fade: true });

function RootNavigator() {
  const { status } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Figtree_500Medium_Italic,
    GeistMono_500Medium,
  });
  // A font that fails to load falls back to the system font; never stay on
  // the splash because of it.
  const ready = (fontsLoaded || fontError != null) && status !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  const signedIn = status === "signedIn";

  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen
          name="verify"
          options={{
            title: "",
            headerTransparent: true,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            headerTintColor: colors.ink,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}
