import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecommendPanel } from "../RecommendPanel";
import { CLIENT_GUIDE_PATH, recommendEmail } from "@/lib/firm/recommend";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const text = recommendEmail({
  firmName: "Bergström Redovisning AB",
  joinUrl: "https://app.unreceipt.com/app/connect/AbCdEfGhIjKlMnOpQrStUv",
  guideUrl: `https://app.unreceipt.com${CLIENT_GUIDE_PATH}`,
});

describe("RecommendPanel", () => {
  it("shows the Swedish email, copies its text and offers the client guide", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<RecommendPanel text={text} />);
    expect(screen.getByRole("heading", { name: "Rekommendera UnReceipt till klienter" })).toBeInTheDocument();
    expect(screen.getByTestId("recommend-subject")).toHaveTextContent(text.subject);
    expect(screen.getByTestId("recommend-body").textContent).toBe(text.body);
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(text.body);
    const guide = screen.getByRole("link", { name: /Client guide \(PDF, English\)/ });
    expect(guide).toHaveAttribute("href", CLIENT_GUIDE_PATH);
    expect(guide).toHaveAttribute("download");
  });
});
