import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "UnReceipt — The cleanest way to track spending";
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
          fontFamily: "Inter, sans-serif",
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
            fontSize: "56px",
            fontWeight: 800,
            color: "white",
            textAlign: "center",
            lineHeight: 1.2,
            marginBottom: "24px",
          }}
        >
          The Cleanest Way to
          <br />
          Track Spending
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "24px",
            color: "#a0a4c0",
            textAlign: "center",
          }}
        >
          Automatic expense receipt capture for businesses
        </div>

        {/* Badge */}
        <div
          style={{
            display: "flex",
            gap: "32px",
            marginTop: "48px",
          }}
        >
          {["< 5 min capture", "94% compliance", "No card switch"].map(
            (stat) => (
              <div
                key={stat}
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
                {stat}
              </div>
            )
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
