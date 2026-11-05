import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AddClientDialog } from "@/app/firm/clients/AddClientDialog";

const fetchMock = vi.fn();

describe("AddClientDialog", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: "x", emailed: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("opens the form, posts the client and reports the sent invite", async () => {
    const user = userEvent.setup();
    render(<AddClientDialog />);
    await user.click(screen.getByRole("button", { name: "Add client" }));
    await user.type(screen.getByLabelText("Company name"), "Acme AB");
    await user.type(screen.getByLabelText("Org.nr (optional)"), "556677-8899");
    await user.type(screen.getByLabelText("Their email"), "anna@acme.se");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/firm/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Acme AB", client_org_number: "556677-8899", email: "anna@acme.se" }),
    });
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Invite sent to anna@acme.se.");
  });

  it("says when the email could not be sent", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: "x", emailed: false }) });
    render(<AddClientDialog />);
    await user.click(screen.getByRole("button", { name: "Add client" }));
    await user.type(screen.getByLabelText("Company name"), "Acme AB");
    await user.type(screen.getByLabelText("Their email"), "anna@acme.se");
    await user.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByRole("status")).toHaveTextContent("couldn't be sent");
  });

  it("shows the server's error", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "That doesn't look like an email address." }) });
    render(<AddClientDialog />);
    await user.click(screen.getByRole("button", { name: "Add client" }));
    await user.type(screen.getByLabelText("Company name"), "Acme AB");
    await user.type(screen.getByLabelText("Their email"), "x@y.se");
    await user.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("email address");
  });
});
