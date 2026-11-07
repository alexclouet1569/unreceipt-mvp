import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clampView, MAX_SCALE, ZoomableImage, zoomAround } from "@/components/receipt/ZoomableImage";
import { PhotoViewer } from "@/components/receipt/PhotoViewer";

afterEach(cleanup);

describe("zoom maths", () => {
  it("keeps the point under the fingers in place", () => {
    // A point 100px right of centre stays 100px right of centre.
    const view = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 0 });
    expect(view).toEqual({ scale: 2, x: -100, y: 0 });
    expect(view.x + view.scale * 100).toBe(100);
  });

  it("stops the photo leaving its frame and caps the zoom", () => {
    expect(clampView({ scale: 2, x: 999, y: -999 }, 300, 400)).toEqual({ scale: 2, x: 150, y: -200 });
    expect(clampView({ scale: 1, x: 50, y: 50 }, 300, 400)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(clampView({ scale: 40, x: 0, y: 0 }, 300, 400).scale).toBe(MAX_SCALE);
  });
});

describe("ZoomableImage", () => {
  it("zooms with the buttons and can't go below 100 %", async () => {
    const user = userEvent.setup();
    render(<ZoomableImage src="data:image/png;base64,AA==" alt="Receipt" />);
    const img = screen.getByRole("img", { name: "Receipt" });

    expect(screen.getByRole("button", { name: /Zoom out/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Zoom in/ }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    expect(img.style.transform).toContain("scale(1.5)");

    await user.click(screen.getByRole("button", { name: /Zoom out/ }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});

describe("PhotoViewer", () => {
  it("offers no delete for a saved receipt's original", () => {
    render(<PhotoViewer open onOpenChange={() => {}} src="data:image/png;base64,AA==" alt="Original receipt" />);
    expect(screen.getByRole("button", { name: /Close photo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete photo/i })).toBeNull();
  });
});
