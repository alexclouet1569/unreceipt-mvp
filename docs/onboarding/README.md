# Onboarding guides (PDF)

Two A4 guides for the accounting-firm pilot, in the brand of `DESIGN.md`:

| Guide | Source | PDF |
|---|---|---|
| For the accounting firm (8 pages) | `accountant.html` | `UnReceipt-Guide-for-accounting-firms.pdf` |
| For the firm's clients (5 pages) | `client.html` | `UnReceipt-Guide-for-clients.pdf` |

Both share `style.css` (tokens from `DESIGN.md`), the fonts in `fonts/` (Manrope, Figtree, Geist Mono; SIL Open Font License, the files `next/font` downloads) and the screenshots in `img/`.

Every button name, limit and rule in the text was taken from the code (November 2026). When a feature changes, change the guide in the same PR.

## Change the text

Edit the HTML, then render both PDFs:

```bash
node docs/onboarding/scripts/render.mjs
```

Each `<section class="page">` is one fixed A4 page: text that doesn't fit is cut off rather than flowing on. The script exits with an error naming the page and how many pixels too long it is; shorten the text or a screenshot until it passes.

If Playwright says its browser isn't installed, run `npx playwright install chromium`, or point it at a Chrome you have: `PW_CHROMIUM=/path/to/chrome node docs/onboarding/scripts/render.mjs`.

## Retake the screenshots

They come from the public demo tours (`/demo/accountant`, `/demo/company`): the real screens with sample data. The demo calls no database, so placeholder Supabase values are enough:

```bash
printf 'NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n' > .env.local
npx next dev -p 3000
```

Then, in another terminal:

```bash
node docs/onboarding/scripts/capture.mjs http://localhost:3000
node docs/onboarding/scripts/render.mjs
```

Never take guide screenshots from a real account: they would show a customer's receipts.
