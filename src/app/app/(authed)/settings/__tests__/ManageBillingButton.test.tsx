import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManageBillingButton } from "../ManageBillingButton";

const originalLocation = window.location;
const assign = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  assign.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("ManageBillingButton", () => {
  it("opens the Stripe portal URL the route returns", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/x" }), { status: 200 })
    );
    const user = userEvent.setup();
    render(<ManageBillingButton />);
    await user.click(screen.getByRole("button", { name: "Manage billing" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/billing/portal", { method: "POST" });
    expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p/session/x");
  });

  it("explains a failure and lets the person try again", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Couldn't open billing. Try again in a moment." }), { status: 502 })
    );
    const user = userEvent.setup();
    render(<ManageBillingButton />);
    await user.click(screen.getByRole("button", { name: "Manage billing" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't open billing");
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("never shows the route's error code; a 401 asks the person to sign in again", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
    const user = userEvent.setup();
    render(<ManageBillingButton />);
    await user.click(screen.getByRole("button", { name: "Manage billing" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You were signed out");
    expect(alert).not.toHaveTextContent("unauthorized");
  });
});
