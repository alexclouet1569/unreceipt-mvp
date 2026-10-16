import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { OwnAddresses } from "@/app/app/(authed)/settings/forwarding/OwnAddresses";

const fetchMock = vi.fn();

describe("OwnAddresses", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("lists the sign-in email and the added addresses", () => {
    render(<OwnAddresses accountEmail="anna@acme.se" addresses={["anna@gmail.com"]} />);
    expect(screen.getByText("anna@acme.se")).toBeInTheDocument();
    expect(screen.getByText("Sign-in email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove anna@gmail.com" })).toBeInTheDocument();
  });

  it("adds a typed address, then refreshes", async () => {
    const user = userEvent.setup();
    render(<OwnAddresses accountEmail={null} addresses={[]} />);
    await user.type(screen.getByLabelText("Add an email address"), "anna@gmail.com");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/profile/addresses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "anna@gmail.com" }),
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server's error", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "You can add up to 10 addresses." }) });
    render(<OwnAddresses accountEmail={null} addresses={[]} />);
    await user.type(screen.getByLabelText("Add an email address"), "x@y.se");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 10");
  });
});
