// Colors and fonts copied from DESIGN.md (light mode). The video follows the
// product's rules: cream paper, Deep Space ink, the brand green as an accent,
// Geist Mono only on amounts, hairline cards without shadows, no gradients.
export const C = {
  brand: "#27BE7B",
  brandDeep: "#1F9D63",
  brandAction: "#1A7F52",
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
  skeleton: "#EFEDE6",
  photoGround: "#303568",
} as const;

export const F = {
  sans: "Manrope, 'Manrope Fallback', sans-serif",
  accent: "Figtree, 'Figtree Fallback', sans-serif",
  mono: "'Geist Mono', 'Geist Mono Fallback', monospace",
} as const;

/** DESIGN.md motion curves. */
export const EASE_IN_OUT_ENTRANCE = [0.32, 0.72, 0, 1] as const;
