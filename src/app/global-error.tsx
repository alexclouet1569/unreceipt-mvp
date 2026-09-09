"use client";

// Top-level error boundary. Unlike route-level error.tsx, this REPLACES the
// root layout (so it must render its own <html>/<body>) and is the only thing
// that catches errors thrown in the root layout itself. It is the last line
// of defense against a fully dead page.
//
// Styling is inline on purpose: global-error renders without the root layout,
// so globals.css / the font variables are not guaranteed to be applied. Inline
// styles keep the message readable no matter what broke below it. Colors track
// the brand tokens in globals.css (White Mist surface, Deep Space ink).

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          backgroundColor: "#FAFAF7",
          color: "#303568",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ width: "100%", maxWidth: "24rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              margin: "0 0 0.5rem",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.5,
              color: "rgba(48, 53, 104, 0.65)",
              margin: "0 0 1.5rem",
            }}
          >
            The app hit an unexpected error and couldn&apos;t finish loading.
            Try again — if it keeps happening, reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              height: "2.75rem",
              border: "none",
              borderRadius: "0.5rem",
              backgroundColor: "#27BE7B",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "rgba(48, 53, 104, 0.65)",
                margin: "1rem 0 0",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
