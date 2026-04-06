import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "512px",
          height: "512px",
          background: "#27BE7B",
          borderRadius: "108px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "280px", color: "white", fontWeight: 800 }}>
          U
        </span>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
