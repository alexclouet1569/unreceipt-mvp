// Words on Google's own screens that our mailbox copy quotes (the explainer
// before the consent screen, the result banner after it). Kept here, in one
// place, so a rename at Google is one edit.
//
// Sources (read 2026-11-13):
//   unverified*  support.google.com/cloud/answer/7454865 ("Unverified apps"):
//                the "Google hasn't verified this app" screen, its
//                "Advanced" link and "Go to <app name> (unsafe)".
//   readEmail    developers.google.com/identity/protocols/oauth2/scopes
//                (gmail.readonly) and the granular consent screen's checkbox.
//                Google's scope list words it "View your email messages and
//                settings"; the consent screen's checkbox wording is what the
//                customer must find, and it hasn't been seen on a real screen.
// None of these has been checked on a real consent screen yet, so all are
// `verified: false` (like settings/forwarding/guide/ui-labels.ts). The product
// is English only: a Google account set to another language shows these in
// that language.

export type ScreenLabel = { text: string; verified: boolean };

const l = (text: string, verified = true): ScreenLabel => ({ text, verified });

export const GOOGLE_SCREEN = {
  unverifiedTitle: l("Google hasn’t verified this app", false),
  advanced: l("Advanced", false),
  goToApp: l("Go to UnReceipt (unsafe)", false),
  readEmail: l("Read your email messages and settings", false),
} as const;
