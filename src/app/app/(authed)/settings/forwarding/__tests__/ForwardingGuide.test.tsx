import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ForwardingGuide } from "@/app/app/(authed)/settings/forwarding/ForwardingGuide";
import { gmailFilterQuery } from "@/lib/forwarding-filters";

const ADDRESS = "receipts+abc12345mn@in.unreceipt.com";

describe("ForwardingGuide", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
  });

  it("explains the address and starts on the Gmail steps", () => {
    render(<ForwardingGuide forwardingEmail={ADDRESS} confirmation={null} />);
    expect(screen.getByText("Emails become receipts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gmail" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(gmailFilterQuery())).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Gmail/)).toBeInTheDocument();
  });

  it("shows Gmail's confirmation code once it has arrived", () => {
    render(
      <ForwardingGuide
        forwardingEmail={ADDRESS}
        confirmation={{ code: "593872831", forAddress: "anna@gmail.com", receivedAt: new Date().toISOString() }}
      />,
    );
    expect(screen.getByText("593872831")).toBeInTheDocument();
    expect(screen.getByText(/Code for anna@gmail.com/)).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for Gmail/)).not.toBeInTheDocument();
  });

  it("says so when Gmail's email arrived without a readable code", () => {
    render(
      <ForwardingGuide
        forwardingEmail={ADDRESS}
        confirmation={{ code: null, forAddress: null, receivedAt: new Date().toISOString() }}
      />,
    );
    expect(screen.getByText(/couldn't read the code/)).toBeInTheDocument();
  });

  it("switches to the Outlook steps with the work-account caveat", async () => {
    const user = userEvent.setup();
    render(<ForwardingGuide forwardingEmail={ADDRESS} confirmation={null} />);
    await user.click(screen.getByRole("button", { name: "Outlook" }));
    expect(screen.getByRole("button", { name: "Outlook" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/allow automatic forwarding to in.unreceipt.com/)).toBeInTheDocument();
    expect(screen.queryByText(gmailFilterQuery())).not.toBeInTheDocument();
  });
});
