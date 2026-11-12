// The light and dark colour tokens (DESIGN.md "Color"), apart from theme.ts
// so tests can read them without React Native. Screens use useColors() or
// makeStyles() from theme.ts.

export type Palette = {
  brand: string;
  brandDeep: string;
  /** Filled actions (primary button, scan button), ticks, the chart's one green. */
  brandAction: string;
  brandActionDeep: string;
  /** Text and icons on brandAction: white on light, Deep Space on dark (the dark green is light). */
  onBrandAction: string;
  brandTint: string;
  surface: string;
  card: string;
  ink: string;
  /**
   * Fill of the ink button and the Undo bar: a second action that must not
   * outshine the green one. Deep Space on light; a quiet navy on dark, where
   * ink itself is cream (DESIGN.md "Dark mode").
   */
  inkFill: string;
  /** Text and icons on inkFill. */
  onInk: string;
  inkMuted: string;
  inkFaint: string;
  hairline: string;
  negative: string;
  /** The red behind a swipe's Delete: the same fill in both modes, white text 5.0:1. */
  destructiveFill: string;
  attention: string;
  attentionTint: string;
  attentionDeep: string;
  attentionMint: string;
  /** The tab badge: white text the system draws, so the light honey in both modes (5.4:1). */
  badge: string;
  /** A switch's thumb on its ink track: white on navy, Deep Space on the cream track of dark mode. */
  switchThumb: string;
  /** Undo on the ink bar: --brand, 4.8:1 on Deep Space and 4.5:1 on the dark ink fill. */
  undo: string;
  /** Behind controls laid over a photo (the photo viewer's close button). */
  inkScrim: string;
  /** The photo viewer's ground: always dark, so a white receipt stands out. */
  photoGround: string;
  /** Placeholder shapes while the very first list loads (DESIGN.md, native app). */
  skeleton: string;
  white: string;
};

export const lightColors: Palette = {
  brand: "#27BE7B",
  brandDeep: "#1F9D63",
  brandAction: "#1A7F52",
  brandActionDeep: "#176E47",
  onBrandAction: "#FFFFFF",
  brandTint: "#ECF7E7",
  surface: "#FAFAF7",
  card: "#FFFFFF",
  ink: "#303568",
  inkFill: "#303568",
  onInk: "#FFFFFF",
  inkMuted: "#5A5F7A",
  inkFaint: "#9CA0B8",
  hairline: "#E8E5DD",
  negative: "#C73E4E",
  destructiveFill: "#C73E4E",
  attention: "#C99440",
  attentionTint: "#FBF1DE",
  attentionDeep: "#8C6320",
  attentionMint: "#6B9778",
  badge: "#8C6320",
  switchThumb: "#FFFFFF",
  undo: "#27BE7B",
  inkScrim: "rgba(48, 53, 104, 0.7)",
  photoGround: "#303568",
  skeleton: "#EFEDE6",
  white: "#FFFFFF",
};

// DESIGN.md "Dark mode". Contrast on --card #1A1D33: ink 13.6:1, inkMuted
// 7.1:1, brandAction 6.9:1 (Deep Space on it 7.8:1), negative 5.8:1,
// attentionDeep 8.9:1; inkFaint 3.3:1 stays for placeholders only.
export const darkColors: Palette = {
  brand: "#27BE7B",
  brandDeep: "#1F9D63",
  brandAction: "#27BE7B",
  brandActionDeep: "#1F9D63",
  onBrandAction: "#0F1124",
  brandTint: "#1A3A2A",
  surface: "#0F1124",
  card: "#1A1D33",
  ink: "#EFE8DA",
  inkFill: "#363A5E",
  onInk: "#EFE8DA",
  inkMuted: "#A4A8C0",
  inkFaint: "#6A6E88",
  hairline: "#2A2D45",
  negative: "#F0707E",
  destructiveFill: "#C73E4E",
  attention: "#C99440",
  attentionTint: "#33291A",
  attentionDeep: "#E8B566",
  attentionMint: "#7FB08E",
  badge: "#8C6320",
  switchThumb: "#0F1124",
  undo: "#27BE7B",
  inkScrim: "rgba(15, 17, 36, 0.7)",
  photoGround: "#0F1124",
  skeleton: "#23263D",
  white: "#FFFFFF",
};
