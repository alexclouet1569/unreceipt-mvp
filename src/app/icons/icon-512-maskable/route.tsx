import { ImageResponse } from "next/og";
import { IconImage } from "../_isotype";

export const runtime = "edge";

// PWA maskable icon — square, no border-radius. The glyph sits inside the
// inner ~50% safe-zone so OS mask shapes (circle, squircle, rounded square)
// never clip it. See https://w3c.github.io/manifest/#icon-masks.
export async function GET() {
  return new ImageResponse(<IconImage size={512} maskable />, {
    width: 512,
    height: 512,
  });
}
