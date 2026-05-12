import { ImageResponse } from "next/og";
import { IconImage } from "../_isotype";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(<IconImage size={192} />, { width: 192, height: 192 });
}
