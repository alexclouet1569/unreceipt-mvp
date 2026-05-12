import { ImageResponse } from "next/og";
import { IconImage } from "../_isotype";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(<IconImage size={512} />, { width: 512, height: 512 });
}
