// Store logo for a merchant on the hand-checked list (src/lib/merchant-logos.ts).
//
// The server fetches the site's icon so the customer's IP and which shop
// they bought from never reach the icon service. Only slugs on the list
// are served — this is not an open image proxy — and responses are
// cached hard by the browser and Vercel's CDN, so each logo is fetched
// from the icon service about once a month. No auth: logos aren't
// private, and proxy.ts lets this path skip the session refresh.
//
// Anything that fails returns 404 and the client shows the merchant's
// initials instead.

import { NextResponse, type NextRequest } from "next/server";
import { merchantLogoDomain } from "@/lib/merchant-logos";

export const runtime = "nodejs";

const ICON_SIZE = 128;
// Badges are 40–48 CSS px, so 80–96 device px on a phone; a 16 or 32 px
// favicon blown up to that looks blurry, and initials look better.
const MIN_ICON_PX = 64;
const MAX_ICON_BYTES = 200 * 1024;
const FETCH_TIMEOUT_MS = 4000;
// PNG only: its size sits at a fixed place in the header, so the quality
// bar below is checkable. The icon service answers PNG for real icons.
const ALLOWED_TYPES = new Set(["image/png"]);

/** Width and height from a PNG's IHDR chunk, or null if it isn't a PNG. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const notFound = () =>
  new NextResponse(null, {
    status: 404,
    // Short so a temporary failure heals, long enough to absorb a burst.
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const domain = merchantLogoDomain(slug);
  // A query string would get a fresh CDN cache entry, and so a fresh
  // upstream fetch, per request; the logo never needs one.
  if (!domain || request.nextUrl.search) return notFound();

  try {
    const res = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${ICON_SIZE}`,
      // No Next data cache: it would also keep a temporary failure for
      // the whole revalidate window. The CDN cache below is enough.
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow", cache: "no-store" },
    );
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    // The service answers 404 with a generic globe when a site has no icon.
    if (!res.ok || !ALLOWED_TYPES.has(type)) return notFound();
    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_ICON_BYTES) return notFound();
    const size = pngSize(new Uint8Array(body));
    if (!size || Math.min(size.width, size.height) < MIN_ICON_PX) return notFound();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[/api/merchant-logo] fetch failed:", slug, err);
    return notFound();
  }
}
