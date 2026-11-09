import { describe, expect, it } from "vitest";
import { buildPilotOverview } from "../pilot";

const NOW = new Date("2026-11-16T12:00:00Z");

const raw = () => ({
  firms: [{ id: "f1", name: "Byrån AB", created_at: "2026-11-01T09:00:00Z" }],
  members: [
    { firm_id: "f1", email: "anna@byran.se", role: "admin", user_id: "u-anna", claimed_at: "2026-11-02T08:00:00Z" },
    { firm_id: "f1", email: "erik@byran.se", role: "staff", user_id: null, claimed_at: null },
  ],
  links: [
    { firm_id: "f1", organization_id: "o1", client_name: "Acme AB", status: "active", direction: "firm", weekly_reminder: true, accepted_at: "2026-11-03T10:00:00Z", created_at: "2026-11-02T10:00:00Z" },
    { firm_id: "f1", organization_id: null, client_name: "Later AB", status: "invited", direction: "firm", weekly_reminder: true, accepted_at: null, created_at: "2026-11-10T10:00:00Z" },
  ],
  receipts: [
    { organization_id: "o1", status: "verified", source: "paper", created_at: "2026-11-15T09:00:00Z", merchant_name: "Byggmax", total: 2486, receipt_date: "2026-11-15", purchased_at: null },
    { organization_id: "o1", status: "pending_review", source: "email", created_at: "2026-11-14T09:00:00Z", merchant_name: "Ahlsell", total: 3912.5, receipt_date: "2026-11-02", purchased_at: null },
    { organization_id: "o1", status: "pending_review", source: "paper", created_at: "2026-11-01T09:00:00Z", merchant_name: null, total: null, receipt_date: "2026-11-01", purchased_at: null },
    // Another company the firm isn't linked to: never shown.
    { organization_id: "other", status: "verified", source: "paper", created_at: "2026-11-15T09:00:00Z", merchant_name: "X", total: 1, receipt_date: "2026-11-15", purchased_at: null },
  ],
  reminders: [{ organization_id: "o1", kind: "weekly", missing_count: 2, review_count: 1, recipients: 1, sent_at: "2026-11-16T06:10:00Z" }],
  bankLines: [
    { organization_id: "o1", imported_at: "2026-11-12T08:00:00Z" },
    { organization_id: "o1", imported_at: "2026-11-12T08:00:00Z" },
  ],
});

describe("buildPilotOverview", () => {
  it("summarises each firm's clients without receipt contents", () => {
    const o = buildPilotOverview(raw(), NOW);
    expect(o.totals).toEqual({ firms: 1, clients: 1, receiptsThisWeek: 2, toComplete: 1, remindersThisWeek: 1 });
    const [firm] = o.firms;
    expect(firm.members).toEqual([
      { email: "anna@byran.se", role: "admin", signedIn: true },
      { email: "erik@byran.se", role: "staff", signedIn: false },
    ]);
    expect(firm.invited).toEqual([{ name: "Later AB", since: "2026-11-10T10:00:00Z", direction: "firm" }]);
    expect(firm.clients[0]).toMatchObject({
      name: "Acme AB",
      receipts: 3,
      thisWeek: 2,
      toComplete: 1,
      toConfirm: 1,
      bankLines: 2,
      weeklyReminder: true,
      lastReminderAt: "2026-11-16T06:10:00Z",
      bySource: { photo: 2, "forwarded email": 1 },
    });
    expect(JSON.stringify(o)).not.toContain("Byggmax");
    expect(JSON.stringify(o)).not.toContain("2486");
  });

  it("lists recent events newest first", () => {
    const o = buildPilotOverview(raw(), NOW);
    expect(o.feed.map((e) => e.text)).toEqual([
      "Weekly reminder: 2 payments without receipt, 1 to complete",
      "New receipt (photo)",
      "New receipt (forwarded email), to confirm",
      "Bank statement imported (2 payments out)",
      "Client invited",
      "Client connected",
      "anna@byran.se signed in for the first time",
      "New receipt (photo), missing a field",
    ]);
  });
});
