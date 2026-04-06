import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "192px",
          height: "192px",
          background: "#27BE7B",
          borderRadius: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "100px", color: "white", fontWeight: 800 }}>
          U
        </span>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
