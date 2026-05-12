import { ImageResponse } from "next/og";
import { IconImage } from "../_isotype";

export const runtime = "edge";

// iOS apple-touch-icon — 180×180 is the size iOS Safari requests when a
// user adds the site to the home screen. iOS already applies a rounded-
// rectangle mask, so we render with a small radius so the corners look
// right when no mask is applied (older versions / share previews).
export async function GET() {
  return new ImageResponse(<IconImage size={180} />, {
    width: 180,
    height: 180,
  });
}
