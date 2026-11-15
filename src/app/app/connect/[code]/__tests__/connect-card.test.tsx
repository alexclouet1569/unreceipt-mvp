import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConnectCard } from "../_connect-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CODE = "AbCdEfGhIjKlMnOpQrStUv";
const open = (adminDomain: { domain: string; personal: boolean } | null = { domain: "bergstrom.se", personal: false }) => ({
  firmName: "Bergström Redovisning AB",
  adminDomain,
  state: { kind: "open" as const, companyName: "Hallonbergen Bygg AB" },
});

describe("ConnectCard", () => {
  it("asks the question, says who runs the firm, and shares on yes", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, firmName: "Bergström Redovisning AB" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectCard view={open()} code={CODE} email="anna@hallonbygg.se" appUrl={null} />);
    expect(screen.getByRole("heading", { name: "Share your receipts with Bergström Redovisning AB?" })).toBeInTheDocument();
    expect(screen.getByText("Its administrator's email is at bergstrom.se.")).toBeInTheDocument();
    expect(screen.getByText(/For Hallonbergen Bygg AB · signed in as anna@hallonbygg.se/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, share" }));
    expect(await screen.findByText("Bergström Redovisning AB now sees your receipts")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/firm-connect", expect.objectContaining({ method: "POST", body: JSON.stringify({ code: CODE }) }));
  });

  it("warns when the admin uses a personal mailbox", () => {
    render(<ConnectCard view={open({ domain: "gmail.com", personal: true })} code={CODE} email={null} appUrl={null} />);
    expect(screen.getByText(/personal gmail.com address. Make sure this is your accountant/)).toBeInTheDocument();
  });

  it("explains a link that doesn't work, another firm, and the firm's own link", () => {
    const { unmount } = render(<ConnectCard view={{ state: { kind: "missing" } }} code={CODE} email={null} appUrl={null} />);
    expect(screen.getByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    unmount();
    const other = render(
      <ConnectCard view={{ firmName: "Byrå B", adminDomain: null, state: { kind: "other_firm", firmName: "Byrå A" } }} code={CODE} email={null} appUrl={null} />,
    );
    expect(screen.getByRole("heading", { name: "You already share with Byrå A" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, share" })).toBeNull();
    other.unmount();
    render(<ConnectCard view={{ firmName: "Byrå B", adminDomain: null, state: { kind: "own_firm" } }} code={CODE} email={null} appUrl={null} />);
    expect(screen.getByRole("heading", { name: "This is your firm's own link" })).toBeInTheDocument();
  });

  it("offers the iPhone app after sharing, when there is a link", () => {
    render(
      <ConnectCard
        view={{ firmName: "Byrå", adminDomain: null, state: { kind: "already" } }}
        code={CODE}
        email={null}
        appUrl="https://apps.apple.com/app/id123"
      />,
    );
    expect(screen.getByRole("link", { name: "Get the UnReceipt app" })).toHaveAttribute("href", "https://apps.apple.com/app/id123");
  });
});
