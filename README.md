This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Email forwarding intake (Resend Inbound)

The webhook at `src/app/api/intake/email/route.ts` accepts inbound email
events from Resend's Inbound product and converts them into rows in
`public.receipts`. Each user gets a unique forwarding alias of the form
`receipts+<hash>@in.unreceipt.com` — the hash is `profiles.email_alias_hash`,
minted lazily on first `/app` load.

### DNS records (manual)

Add these to the DNS zone for `in.unreceipt.com`. None of this is in IaC —
update it from the registrar UI and verify in Resend.

| Type | Host | Value | Notes |
|------|------|-------|-------|
| MX   | `in` | `inbound.resend.com` priority `10` | Receives the mail. |
| TXT  | `in` | `v=spf1 include:_spf.resend.com -all` | SPF. |
| CNAME | `resend._domainkey.in` | `resend._domainkey.resend.com` | DKIM. |

After publishing, paste `in.unreceipt.com` into Resend Dashboard →
Inbound → Add domain and wait for DNS verification (≈5 min). Then:

1. Create an inbound route catching `receipts+*@in.unreceipt.com`.
2. Point the route at the webhook URL
   `https://app.unreceipt.com/api/intake/email`.
3. Copy the webhook signing secret into Vercel env as
   `RESEND_INBOUND_WEBHOOK_SECRET` (Production and Preview).

### Local testing

The handler verifies Svix-style signatures on every request, so you can't
just `curl` it. To test locally:

```sh
# 1. start the dev server with the secret set
RESEND_INBOUND_WEBHOOK_SECRET=whsec_dev_secret_base64 npm run dev

# 2. run the e2e spec against staging (skipped in CI)
RUN_INTAKE_E2E=1 \
  INTAKE_E2E_ALIAS_HASH=<seeded user's email_alias_hash> \
  RESEND_INBOUND_WEBHOOK_SECRET=whsec_dev_secret_base64 \
  PLAYWRIGHT_BASE_URL=http://localhost:3000 \
  npm run test:e2e -- email-intake.spec.ts
```

The unit tests in `src/app/api/intake/email/__tests__/route.test.ts`
cover the signature, idempotency, and alias-lookup paths end-to-end
against mocked Supabase and parser modules.
