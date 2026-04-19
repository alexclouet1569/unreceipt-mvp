import { ImageResponse } from "next/og";

export const alt =
  "UnReceipt — Automatic expense receipt capture. From Chaos to Clarity.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #303568 0%, #1a1d3a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "#27BE7B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              color: "white",
              fontWeight: 800,
            }}
          >
            U
          </div>
          <span
            style={{
              fontSize: "36px",
              fontWeight: 700,
              color: "white",
            }}
          >
            UnReceipt
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: "56px",
            fontWeight: 800,
            color: "white",
            textAlign: "center",
            lineHeight: 1.2,
            marginBottom: "24px",
          }}
        >
          <span>From Chaos to Clarity</span>
          <span style={{ color: "#27BE7B" }}>Automatically.</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "24px",
            color: "#a0a4c0",
            textAlign: "center",
          }}
        >
          Automatic expense receipt capture for businesses — Paper is Past
        </div>

        {/* Badges */}
        <div
          style={{
            display: "flex",
            gap: "32px",
            marginTop: "48px",
          }}
        >
            <div
            style={{
              background: "rgba(39, 190, 123, 0.15)",
              border: "1px solid rgba(39, 190, 123, 0.3)",
              borderRadius: "999px",
              padding: "10px 24px",
              color: "#27BE7B",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Free for small teams
          </div>
          <div
            style={{
              background: "rgba(39, 190, 123, 0.15)",
              border: "1px solid rgba(39, 190, 123, 0.3)",
              borderRadius: "999px",
              padding: "10px 24px",
              color: "#27BE7B",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Any card works
          </div>
          <div
            style={{
              background: "rgba(39, 190, 123, 0.15)",
              border: "1px solid rgba(39, 190, 123, 0.3)",
              borderRadius: "999px",
              padding: "10px 24px",
              color: "#27BE7B",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Zero employee effort
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
