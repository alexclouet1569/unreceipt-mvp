// Design tokens from DESIGN.md (the source of truth), for the native app.
// Light and dark follow the iPhone's appearance (DESIGN.md "Dark mode",
// app.json userInterfaceStyle "automatic"). Screens read them through
// useColors() or a makeStyles() hook, never a module-level constant, so a
// switch in Control Centre repaints every screen at once.

import { StyleSheet, useColorScheme } from "react-native";

export { darkColors, lightColors, type Palette } from "./palette";
import { darkColors, lightColors, type Palette } from "./palette";

export type Scheme = "light" | "dark";

/** The iPhone's appearance; anything but "dark" is light. */
export function useScheme(): Scheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function paletteFor(scheme: Scheme): Palette {
  return scheme === "dark" ? darkColors : lightColors;
}

/** The palette for the iPhone's current appearance. */
export function useColors(): Palette {
  return paletteFor(useScheme());
}

/**
 * A screen's styles for the current appearance, built once per mode:
 *   const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.card } }));
 *   const styles = useStyles();   // inside the component
 */
export function makeStyles<S extends Parameters<typeof StyleSheet.create>[0]>(
  build: (colors: Palette) => S,
): () => Readonly<S> {
  const cache: Partial<Record<Scheme, Readonly<S>>> = {};
  return function useStyles(): Readonly<S> {
    const scheme = useScheme();
    return (cache[scheme] ??= StyleSheet.create(build(paletteFor(scheme))));
  };
}

// Text colour rule in the app (DESIGN.md, native app): anything that carries
// information (meta rows, labels, converted amounts, currency signs) is
// inkMuted, which passes AA; inkFaint only for placeholders, the "—" of an
// empty value and the version line.

// Font names are the keys given to useFonts() in src/app/_layout.tsx.
export const fonts = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
  accent: "Figtree_500Medium_Italic",
  // Monetary amounts only (DESIGN.md "Mono amounts everywhere").
  mono: "GeistMono_500Medium",
  monoRegular: "GeistMono_400Regular",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 12, xl: 16, xxl: 20, full: 9999 } as const;

// DESIGN.md type scale. letterSpacing is in points (em × size).
export const type = {
  displayXl: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 35, letterSpacing: -0.64 },
  displayLg: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 28, letterSpacing: -0.48 },
  bodyLg: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26, letterSpacing: -0.18 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  // Upper case by style, so VoiceOver reads the words, not letters.
  micro: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    textTransform: "uppercase",
  },
  merchant: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 18, letterSpacing: -0.15 },
  accent: { fontFamily: fonts.accent, fontSize: 14, lineHeight: 21 },
  amountXl: { fontFamily: fonts.mono, fontSize: 18, lineHeight: 20, letterSpacing: -0.18 },
  amountDisplay: { fontFamily: fonts.mono, fontSize: 40, lineHeight: 42, letterSpacing: -0.8 },
  amountRow: { fontFamily: fonts.monoRegular, fontSize: 14, lineHeight: 20 },
} as const;

// DESIGN.md "Motion": springs tuned to feel like UIKit's, not bouncy toys.
export const durations = { micro: 100, short: 200, medium: 320, long: 480 } as const;

export const springs = {
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  settle: { damping: 22, stiffness: 260, mass: 0.8 },
} as const;
