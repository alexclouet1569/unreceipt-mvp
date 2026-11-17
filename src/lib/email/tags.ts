// The flow each transactional email belongs to: Resend's "flow" tag
// (src/lib/email/send.ts) and the utm_campaign of the footer's link to
// unreceipt.com (src/lib/email/site-link.ts). Pure, client-safe.
export type EmailTag =
  | "waitlist"
  | "pilot_welcome"
  | "retention_reminder"
  | "forwarding_setup"
  | "signup_digest"
  | "firm_invite"
  | "client_request"
  | "link_confirmation"
  | "firm_closed"
  | "missing_receipts"
  | "weekly_reminder"
  | "manual_reminder"
  | "firm_welcome"
  | "team_invite"
  | "approval_request"
  | "approval_decision";
