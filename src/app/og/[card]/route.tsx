import { ImageResponse } from "next/og";
import { SHARE_CARDS } from "../_cards";

// Share images of the marketing pages: /og/<page>-<locale>.png, one per page
// and language, drawn once at build time from the page's own eyebrow and
// headline (src/app/og/_cards.ts). Linked by marketingMetadata().

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SHARE_CARDS.map((c) => ({ card: c.file }));
}

const SIZE = { width: 1200, height: 630 };

export async function GET(_request: Request, { params }: { params: Promise<{ card: string }> }) {
  const { card: file } = await params;
  const card = SHARE_CARDS.find((c) => c.file === file);
  if (!card) return new Response("Not found", { status: 404 });

  const titleSize = card.title.length > 48 ? 58 : 68;

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #303568 0%, #1a1d3a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "13px",
              background: "#27BE7B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              color: "white",
              fontWeight: 800,
            }}
          >
            U
          </div>
          <span style={{ fontSize: "32px", fontWeight: 700, color: "white" }}>UnReceipt</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              fontSize: "24px",
              fontWeight: 600,
              color: "#27BE7B",
              textTransform: "uppercase",
              letterSpacing: "2px",
            }}
          >
            {card.eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: `${titleSize}px`,
              fontWeight: 800,
              color: "white",
              lineHeight: 1.15,
              maxWidth: "1000px",
            }}
          >
            {card.title}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "24px", color: "#a0a4c0" }}>unreceipt.com</div>
      </div>
    ),
    {
      ...SIZE,
      // Drawn once per deployment; a deploy replaces it on Vercel's CDN.
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000" },
    }
  );
}
