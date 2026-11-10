// Design tokens from DESIGN.md (the source of truth), for the native app.
// Light mode only for now, like the website inside the old app shell.

export const colors = {
  brand: "#27BE7B",
  brandDeep: "#1F9D63",
  brandAction: "#1A7F52",
  brandActionDeep: "#176E47",
  brandTint: "#ECF7E7",
  surface: "#FAFAF7",
  card: "#FFFFFF",
  ink: "#303568",
  inkMuted: "#5A5F7A",
  inkFaint: "#9CA0B8",
  hairline: "#E8E5DD",
  negative: "#C73E4E",
  attention: "#C99440",
  attentionTint: "#FBF1DE",
  attentionDeep: "#8C6320",
  attentionMint: "#6B9778",
  // Placeholder shapes while the very first list loads (DESIGN.md, native app).
  skeleton: "#EFEDE6",
  white: "#FFFFFF",
} as const;

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
