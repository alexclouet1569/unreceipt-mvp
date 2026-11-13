// Public values, set in mobile/.env for local runs and in eas.json for cloud
// builds. Nothing secret lives in the app: the Supabase publishable key only
// allows what row-level security allows, and everything else goes through
// app.unreceipt.com with the user's own access token.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set (mobile/.env or eas.json)`);
  return value.replace(/\/+$/, "");
}

// EXPO_PUBLIC_* must be read with the literal name so Metro inlines it.
export const API_URL = required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL);
export const SUPABASE_URL = required(
  "EXPO_PUBLIC_SUPABASE_URL",
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);
export const SUPABASE_KEY = required(
  "EXPO_PUBLIC_SUPABASE_KEY",
  process.env.EXPO_PUBLIC_SUPABASE_KEY,
);

/**
 * Apple's App Review signs in with this one address and a password (given
 * in the App Store Connect review notes, never in the code): reviewers
 * can't receive our email codes. Every other address signs in with the
 * code. The account holds sample receipts only (mobile/README.md "App
 * Review account").
 */
export const REVIEW_EMAIL = "appreview@unreceipt.com";

/** Same length as the website's code step (src/app/app/login/_auth-lib.ts). */
export const CODE_LENGTH = 6;

/**
 * The privacy policy (App Store 5.1.1(i)): linked under the sign-in and in
 * Account. On the marketing site, English only.
 */
export const PRIVACY_URL = "https://unreceipt.com/privacy";

/** The privacy page's section on connected mailboxes (Google's Limited Use statement). */
export const PRIVACY_MAILBOX_URL = `${PRIVACY_URL}#gmail`;

/** Where an account without access in the app can ask for help. */
export const SUPPORT_EMAIL = "support@unreceipt.com";
