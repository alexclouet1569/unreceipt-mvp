# Supabase Auth email templates

Supabase sends the "confirm your email" and "magic link" emails itself — the
app never sees them. These two files are the branded versions. They live in
the Supabase dashboard, not in the deployed app, so a change here has to be
pasted in by hand.

## 1. Send through Resend (once)

Supabase's built-in sender is for testing and only delivers to members of
your Supabase organisation, so real pilot sign-ups may never receive their
confirmation link. Route auth email through Resend (`unreceipt.com` is
already verified there):

Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:

| Field | Value |
|---|---|
| Sender email | `hello@unreceipt.com` |
| Sender name | `UnReceipt` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a Resend API key — create one just for this ("Supabase SMTP", sending access, domain `unreceipt.com`) |

Then **Authentication → Rate Limits**: raise "emails sent per hour" (the
custom-SMTP default of 30 is fine for the pilot).

## 2. Paste the templates

Supabase → **Authentication → Emails → Templates**:

| Template | Subject | Body |
|---|---|---|
| Confirm signup | `{{ .Token }} is your UnReceipt code` | `confirm-signup.html` |
| Magic Link | `{{ .Token }} is your UnReceipt sign-in code` | `magic-link.html` |

`{{ .Token }}` (the 6-digit code) and `{{ .ConfirmationURL }}` (the link) are
filled in by Supabase. The login page asks for the code first, so sign-up and
"sign in with a code" finish in the same tab — the link stays as a fallback
that also works on another device. Keep **Authentication → Providers → Email
→ Email OTP Length** at 6; `CODE_LENGTH` in `src/app/app/login/_auth-lib.ts`
must match it.

Re-paste both templates whenever these files change — until then Supabase
keeps sending the old link-only emails, and new sign-ups can only confirm
with the link.

## 3. Check

Sign up with a fresh address (any inbox you can read) at
`https://app.unreceipt.com/app/login`, confirm, and you should then also get
the "Welcome to the UnReceipt pilot" email the app sends itself.
