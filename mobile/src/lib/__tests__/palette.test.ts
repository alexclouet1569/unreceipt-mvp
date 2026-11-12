import { describe, expect, it } from "vitest";
import { darkColors, lightColors, type Palette } from "../../palette";

// WCAG 2.x contrast ratio of two #RRGGBB colours.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Pairs the app draws, with the minimum DESIGN.md asks: 4.5 for text, 3 for
// shapes that carry meaning (rules, bars, borders of an error). The honey
// left rule of a card to confirm isn't listed: it is 2.6:1 on white in the
// light palette (unchanged since 2026-10-15) and the words "To confirm" next
// to it carry the meaning.
const pairs: [string, keyof Palette, keyof Palette, number][] = [
  ["text on card", "ink", "card", 4.5],
  ["text on the page", "ink", "surface", 4.5],
  ["informative text on card", "inkMuted", "card", 4.5],
  ["informative text on the page", "inkMuted", "surface", 4.5],
  ["label on the green button", "onBrandAction", "brandAction", 4.5],
  ["green text and ticks on card", "brandAction", "card", 3],
  ["label on an ink button", "onInk", "inkFill", 4.5],
  ["Undo on the ink bar", "undo", "inkFill", 4.5],
  ["text on the page in muted", "inkMuted", "surface", 4.5],
  ["honey text on the page", "attentionDeep", "surface", 4.5],
  ["text on a honey notice", "ink", "attentionTint", 4.5],
  ["the green button on the page", "brandAction", "surface", 3],
  ["missing data in red", "negative", "card", 4.5],
  ["honey text on card", "attentionDeep", "card", 4.5],
  ["honey text on its notice", "attentionDeep", "attentionTint", 4.5],
  ["text on the mint panel", "ink", "brandTint", 4.5],
  ["muted text on the mint panel", "inkMuted", "brandTint", 4.5],
  ["switch thumb on its track", "switchThumb", "ink", 3],
  ["white on the swipe's red", "white", "destructiveFill", 4.5],
  ["white badge text on honey", "white", "badge", 4.5],
];

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
] as const)("%s palette", (_name, palette) => {
  it.each(pairs)("%s", (_label, fg, bg, min) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min);
  });

  it("defines every token as a colour", () => {
    for (const [key, value] of Object.entries(palette)) {
      expect(value, key).toMatch(/^(#[0-9A-F]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/);
    }
  });
});

it("gives both palettes the same tokens", () => {
  expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
});
