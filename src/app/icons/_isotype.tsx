// Shared brand-book App Icon for the PWA icon routes.
//
// Geometry mirrors the SVG in src/components/brand/Wordmark.tsx so the
// installed app icon, the in-app header, and the apple-touch-icon all
// render the same mark. Colors follow the brand book "icon on navy"
// variant (p. 11): Deep Space background, cream receipt body with green
// text lines, green circular arrow.
//
// Designed for `next/og` ImageResponse — pure JSX with style strings,
// no external dependencies, edge-runtime safe.

const BRAND = "#27BE7B";
const INK = "#303568";
const SURFACE = "#FAFAF7";

type IconImageProps = {
  /** Output square size in px (192, 512, 180, …). */
  size: number;
  /**
   * Maskable purpose: removes the rounded corners (OS supplies the mask)
   * and tightens the inner safe-zone to ~70% of the canvas so PWA
   * mask shapes (circle, squircle) never clip the glyph.
   */
  maskable?: boolean;
};

export function IconImage({ size, maskable = false }: IconImageProps) {
  // Brand-mark canvas: when not maskable, render the navy rounded square
  // with the glyph occupying ~62% of the canvas (matches brand book p. 10).
  // When maskable, drop the radius and inset the glyph to ~50% so the OS
  // mask shape (circle, squircle, rounded square) never clips it.
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const glyphSize = Math.round(size * (maskable ? 0.5 : 0.62));

  return (
    <div
      style={{
        width: size,
        height: size,
        background: INK,
        borderRadius: radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Receipt body — cream fill on navy bg */}
        <path
          d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z"
          fill={SURFACE}
        />
        {/* Text lines inside receipt — green */}
        <rect x="36" y="22" width="14" height="2.6" rx="1.3" fill={BRAND} />
        <rect x="33" y="29" width="20" height="2.6" rx="1.3" fill={BRAND} />
        <rect x="33" y="36" width="17" height="2.6" rx="1.3" fill={BRAND} />
        <rect x="33" y="43" width="14" height="2.6" rx="1.3" fill={BRAND} />
        {/* Circular arrow wrapping the top-left — green */}
        <path
          d="M30 26 A12 12 0 1 1 23 11"
          stroke={BRAND}
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M19.5 11 L25.5 7.5 L25.5 14.5 Z" fill={BRAND} />
      </svg>
    </div>
  );
}
