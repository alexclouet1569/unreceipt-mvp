import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
  fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { Dashboard } from "@/app/app/(authed)/dashboard";

const renderDashboard = (showOnboarding: boolean) =>
  render(
    <Dashboard
      userEmail="owner@example.se"
      receipts={[]}
      forwardingEmail="receipts+abc@in.unreceipt.com"
      intakeSmsNumber={null}
      showOnboarding={showOnboarding}
    />,
  );

describe("first-run onboarding", () => {
  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("walks address → first receipt → done, then records completion", async () => {
    const user = userEvent.setup();
    renderDashboard(true);

    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("receipts+abc@in.unreceipt.com")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-fab")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Snap your first receipt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /I'll do it later/ }));
    expect(screen.getByText("You're all set")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to my receipts" }));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/profile/onboarded", { method: "POST" });
    expect(screen.getByText("Your inbox is empty")).toBeInTheDocument();
    expect(screen.getByTestId("capture-fab")).toBeInTheDocument();
  });

  it("opens the capture dialog from step 2", async () => {
    const user = userEvent.setup();
    renderDashboard(true);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: /Take a photo/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("New receipt");
  });

  it("can be skipped from the first screen", async () => {
    const user = userEvent.setup();
    renderDashboard(true);

    await user.click(screen.getByRole("button", { name: "Skip intro" }));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/profile/onboarded", { method: "POST" });
    expect(screen.getByText("Your inbox is empty")).toBeInTheDocument();
  });

  it("isn't shown once done, and the empty state doesn't promise SMS without a number", () => {
    renderDashboard(false);
    expect(screen.queryByText("Step 1 of 3")).toBeNull();
    expect(screen.getByText(/snap a paper one/)).toBeInTheDocument();
    expect(screen.queryByText(/text us a photo/)).toBeNull();
  });
});
