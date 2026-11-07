import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  getNativeApp: vi.fn(),
  isPilotMode: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/native-app-server", () => ({ getNativeApp: mocks.getNativeApp }));
vi.mock("@/lib/pilot", () => ({ isPilotMode: mocks.isPilotMode }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("../SubscribeButton", () => ({ SubscribeButton: () => <button>Subscribe</button> }));

import SubscribePage from "../page";

const IOS = { platform: "ios", version: "1.0.0" };

async function renderPage() {
  render(await SubscribePage({ searchParams: Promise.resolve({}) }));
}

describe("/subscribe", () => {
  beforeEach(() => {
    mocks.getServerUser.mockResolvedValue({ id: "u1", email: "anna@example.se" });
    mocks.getNativeApp.mockResolvedValue(null);
    mocks.isPilotMode.mockReturnValue(false);
  });
  afterEach(() => cleanup());

  it("shows plans and the subscribe button in a browser", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    expect(screen.getByText(/First week free/)).toBeInTheDocument();
  });

  it("in the store app: no button, price, trial or link out when the account has no plan", async () => {
    mocks.getNativeApp.mockResolvedValue(IOS);
    await renderPage();

    expect(screen.getByRole("heading", { name: /This account isn.t active/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/€|kr|free week|First week|subscribe|unreceipt\.com|website/i);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/app/settings"]);
  });

  it("in the store app during the pilot: straight on to the receipts, with no price", async () => {
    mocks.getNativeApp.mockResolvedValue(IOS);
    mocks.isPilotMode.mockReturnValue(true);
    await renderPage();

    expect(screen.getByRole("link", { name: /Continue to your receipts/ })).toHaveAttribute("href", "/app");
    expect(document.body.textContent).not.toMatch(/€|plans start/i);
  });
});
