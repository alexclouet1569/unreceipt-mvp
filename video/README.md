# UnReceipt promo ad

The 30 s and 15 s ad, built with [Remotion](https://www.remotion.dev) (React → MP4). Its own package: nothing here is part of the website build (`video` is excluded in the root `tsconfig.json` and `eslint.config.mjs`).

## Story (30 s)

| Time | Scene | Headline |
|---|---|---|
| 0–3 s | Receipts, emails and "Month-end in 2 days" pile up | Still chasing receipts? |
| 3–11 s | A phone photographs an ICA receipt; a scan line reads it; total and date come first, then the rest | Snap it. AI reads it in seconds. |
| 11–18 s | Uber (€), Clas Ohlson and SJ emails land in the list as "To confirm" | Email receipts arrive on their own. |
| 18–25 s | The owner confirms them, Swedish VAT per rate, the accountant's view and export | VAT split out. Ready for your accountant. |
| 25–30 s | Wordmark | From chaos to clarity — automatically. Join the free pilot · unreceipt.com |

The 15 s cut uses the same scenes, shorter (`src/timings.ts`); its accountant scene skips the confirm step.

Claims kept true to the product: the photo reader sends total and date first (about 1.3 s) and the rest a few seconds later, so the ad says "in seconds"; email receipts arrive as "To confirm" and the owner confirms them; the BAS accounts are the defaults from `src/lib/bookkeeping/bas-map.ts`. No push notifications are shown (the iPhone app has none yet).

## Run

```bash
npm install
npm run studio            # preview in the browser
npm run stills            # storyboard PNGs → out/stills/
npm run render            # all 6 MP4s → out/
```

In a cloud session without Remotion's browser download, point it at the installed Chromium: `REMOTION_CHROME=/opt/pw-browsers/chromium npm run render`.

Compositions: `Ad30-9x16`, `Ad30-1x1`, `Ad30-16x9`, `Ad15-9x16`, `Ad15-1x1`, `Ad15-16x9`. In 9:16 nothing that matters sits in the top 250 px or the bottom 420 px (Reels / TikTok / Shorts buttons).

## Design

Colours and fonts follow `DESIGN.md` (`src/brand.ts`): cream page, Deep Space ink, the brand green as an accent, Geist Mono only on amounts (and on the printed paper receipt), hairline cards, no shadows or gradients. The wordmark is copied from `src/components/brand/Wordmark.tsx`. Fonts are the local copies from `docs/onboarding/fonts` (SIL Open Font License), so rendering needs no network.

## Music

Put a licensed track at `public/music.mp3`; it isn't wired in until one is chosen. Check the licence covers paid social ads.

## Licence

Remotion is free for individuals and companies of up to 3 people; larger companies need a Remotion company licence.
