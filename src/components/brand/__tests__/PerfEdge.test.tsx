import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PerfEdge } from "../PerfEdge";

afterEach(cleanup);

describe("PerfEdge", () => {
  it("renders edge variant by default with a dot-mask background", () => {
    render(<PerfEdge />);
    const el = screen.getByTestId("perfedge");
    expect(el.getAttribute("data-variant")).toBe("edge");
    expect(el.getAttribute("data-direction")).toBe("top");
    expect(el.style.backgroundImage).toContain("radial-gradient");
    expect(el.style.height).toBe("8px");
  });

  it("renders divider variant as a dashed hairline", () => {
    render(<PerfEdge variant="divider" />);
    const el = screen.getByTestId("perfedge");
    expect(el.getAttribute("data-variant")).toBe("divider");
    expect(el.style.borderTop).toContain("dashed");
    expect(el.style.height).toBe("1px");
  });

  it("places the perforation at the bottom when direction='bottom'", () => {
    render(<PerfEdge direction="bottom" />);
    const el = screen.getByTestId("perfedge");
    expect(el.getAttribute("data-direction")).toBe("bottom");
    expect(el.style.backgroundPosition).toBe("0px 100%");
  });
});
