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
const MAX_ICON_BYTES = 200 * 1024;
const FETCH_TIMEOUT_MS = 4000;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const notFound = () =>
  new NextResponse(null, {
    status: 404,
    // Short so a temporary failure heals, long enough to absorb a burst.
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const domain = merchantLogoDomain(slug);
  if (!domain) return notFound();

  try {
    const res = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${ICON_SIZE}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" },
    );
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    // The service answers 404 with a generic globe when a site has no icon.
    if (!res.ok || !ALLOWED_TYPES.has(type)) return notFound();
    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_ICON_BYTES) return notFound();
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
