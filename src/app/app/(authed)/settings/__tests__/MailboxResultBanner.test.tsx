import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { MailboxResultBanner } from "@/app/app/(authed)/settings/mailboxes/MailboxResultBanner";
import {
  parseMailboxResult,
  reasonMessage,
  relativeTime,
  statusLine,
} from "@/app/app/(authed)/settings/mailboxes/copy";
import { RESULT_REASONS } from "@/lib/mailboxes/oauth";

const GENERIC = reasonMessage("server_error");

describe("MailboxResultBanner", () => {
  afterEach(() => {
    cleanup();
    replace.mockReset();
  });

  it("confirms a connection and says where receipts appear", () => {
    render(<MailboxResultBanner result={{ kind: "connected" }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connected. Receipts from the last 30 days are being imported; they appear under Review needed.",
    );
  });

  it("says nothing was connected after a cancel", () => {
    render(<MailboxResultBanner result={{ kind: "cancelled" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing was connected.");
  });

  it.each([
    ["denied", "You didn’t allow access, nothing was connected."],
    ["admin_consent", "Your company’s Microsoft 365 admin must approve UnReceipt first."],
    ["scope_missing", "Tick the box that lets UnReceipt read your email, then try again."],
    ["no_mailbox", "That Microsoft account has no Outlook mailbox"],
    ["limit", "5 mailboxes"],
    ["wrong_account", "different UnReceipt account"],
  ])("explains %s as an alert", (reason, text) => {
    render(<MailboxResultBanner result={{ kind: "error", reason }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });

  it("closes and takes the result off the address", async () => {
    const user = userEvent.setup();
    render(<MailboxResultBanner result={{ kind: "connected" }} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("mailbox-result")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/app/settings", { scroll: false });
  });
});

describe("mailbox copy", () => {
  it("has its own sentence for every reason the callback sends", () => {
    for (const reason of [...RESULT_REASONS, "no_mailbox"]) {
      const text = reasonMessage(reason);
      expect(text.length).toBeGreaterThan(10);
      if (reason !== "server_error") expect(text, reason).not.toBe(GENERIC);
    }
    // Unknown codes read as the generic error.
    expect(reasonMessage("something_new")).toBe(GENERIC);
    expect(reasonMessage(null)).toBe(GENERIC);
  });

  it("reads the result from the address", () => {
    expect(parseMailboxResult("connected", undefined)).toEqual({ kind: "connected" });
    expect(parseMailboxResult("cancelled", "denied")).toEqual({ kind: "cancelled" });
    expect(parseMailboxResult("error", "denied")).toEqual({ kind: "error", reason: "denied" });
    expect(parseMailboxResult(["error"], ["admin_consent"])).toEqual({ kind: "error", reason: "admin_consent" });
    expect(parseMailboxResult("error", "<script>")).toEqual({ kind: "error", reason: "server_error" });
    expect(parseMailboxResult(undefined, undefined)).toBeNull();
    expect(parseMailboxResult("other", undefined)).toBeNull();
  });

  it("words times and statuses plainly", () => {
    const now = Date.parse("2026-11-13T12:00:00Z");
    expect(relativeTime("2026-11-13T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-11-13T11:15:00Z", now)).toBe("45 min ago");
    expect(relativeTime("2026-11-13T10:00:00Z", now)).toBe("2 h ago");
    expect(relativeTime("2026-11-12T08:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-11-10T08:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime("2026-11-01T08:00:00Z", now)).toBe("1 Nov");
    expect(relativeTime("2025-10-01T08:00:00Z", now)).toBe("1 Oct 2025");

    const base = {
      id: "1",
      provider: "google" as const,
      email: "a@gmail.com",
      lastReceiptAt: null,
      lastSyncAt: "2026-11-13T11:00:00Z",
      createdAt: "2026-11-13T11:00:00Z",
    };
    expect(statusLine({ ...base, status: "paused" }, now).tone).toBe("attention");
    expect(statusLine({ ...base, status: "active", lastSyncAt: null }, now).text).toBe("Setting up…");
  });
});
