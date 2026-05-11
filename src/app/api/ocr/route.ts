import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { extractReceipt, type OcrMediaType } from "@/lib/ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision calls typically resolve in 3-8s; give 30s headroom for large images.
export const maxDuration = 30;

const ALLOWED_TYPES: OcrMediaType[] = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const image = form.get("image");
  if (!image || typeof image === "string" || !("arrayBuffer" in image)) {
    return NextResponse.json(
      { error: "image file required" },
      { status: 400 }
    );
  }

  const type = (image as Blob).type;
  if (!ALLOWED_TYPES.includes(type as OcrMediaType)) {
    return NextResponse.json(
      { error: `unsupported image type: ${type || "unknown"}` },
      { status: 400 }
    );
  }

  if ((image as Blob).size > MAX_BYTES) {
    return NextResponse.json(
      { error: "image too large (max 5MB)" },
      { status: 400 }
    );
  }

  try {
    const buf = Buffer.from(await (image as Blob).arrayBuffer());
    const base64 = buf.toString("base64");
    const result = await extractReceipt(base64, type as OcrMediaType);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/ocr] extract failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extract failed" },
      { status: 500 }
    );
  }
}
