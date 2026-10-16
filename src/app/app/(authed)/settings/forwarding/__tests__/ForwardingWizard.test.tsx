import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ForwardingWizard } from "@/app/app/(authed)/settings/forwarding/ForwardingWizard";
import { gmailFilterQuery, outlookSubjectWords } from "@/lib/forwarding-filters";

const ADDRESS = "receipts+abc12345mn@in.unreceipt.com";
const fetchMock = vi.fn();
let status = { confirmation: null as null | { code: string | null; forAddress: string | null; receivedAt: string }, lastEmailAt: null as string | null };

function mockMatchMedia(coarse: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: coarse && q.includes("coarse"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const setup = async () => {
  const user = userEvent.setup();
  render(<ForwardingWizard forwardingEmail={ADDRESS} />);
  // Let the deferred restore from localStorage run.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return user;
};

describe("ForwardingWizard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    status = { confirmation: null, lastEmailAt: null };
    fetchMock.mockReset().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (url === "/api/forwarding/status" ? status : { ok: true, sentTo: "anna@acme.se" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    mockMatchMedia(false);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts by asking where receipts arrive", async () => {
    await setup();
    expect(screen.getByRole("heading", { name: "Where do your receipts arrive?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gmail/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Outlook/ })).toBeInTheDocument();
  });

  it("walks Gmail step by step with the path, a deep link and the things to paste", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /Gmail/ }));

    expect(screen.getByText("Gmail · Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Where to click" })).toHaveTextContent("Forwarding and POP/IMAP");
    expect(screen.getByRole("link", { name: /Open Gmail forwarding settings/ })).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/u/0/#settings/fwdandpop",
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Waiting for Gmail/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(gmailFilterQuery())).toBeInTheDocument();
  });

  it("shows Gmail's code as soon as it arrives", async () => {
    status = { confirmation: { code: "593872831", forAddress: "anna@gmail.com", receivedAt: new Date().toISOString() }, lastEmailAt: null };
    window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider: "gmail", step: 2, done: false }));
    await setup();
    expect(await screen.findByText("593872831")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I've verified it" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/forwarding/status", { cache: "no-store" });
  });

  it("confirms when the test email arrives, then finishes", async () => {
    window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider: "outlook", step: 2, done: false }));
    const user = await setup();
    status = { confirmation: null, lastEmailAt: new Date(Date.now() + 1000).toISOString() };
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/It works/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("heading", { name: "You're set" })).toBeInTheDocument();
  });

  it("lets Outlook users copy each subject word", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /Outlook/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    const words = outlookSubjectWords();
    expect(screen.getAllByRole("button", { name: /^Copy “/ })).toHaveLength(words.length);
  });

  it("on a phone, offers to email the page to the user", async () => {
    mockMatchMedia(true);
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Email me this page" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/forwarding/send-link", { method: "POST" });
    expect(await screen.findByText(/Sent to anna@acme.se/)).toBeInTheDocument();
  });
});
