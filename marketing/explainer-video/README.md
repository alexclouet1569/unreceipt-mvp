# Explainer video

A 40-second video that explains UnReceipt, for the website and LinkedIn. The whole video is one HTML animation (`explainer.html`). `render.mjs` steps through it frame by frame and encodes MP4s with ffmpeg.

| File (in `out/`) | Size | Use |
|---|---|---|
| `unreceipt-explainer-en-landscape.mp4` | 1920×1080, 16:9 | Website, YouTube, LinkedIn |
| `unreceipt-explainer-en-portrait.mp4` | 1080×1350, 4:5 | LinkedIn feed (takes more of a phone screen) |
| `…-poster.png` | same | `<video poster>`, LinkedIn custom thumbnail |

The video has no sound on purpose. LinkedIn and most websites autoplay video muted, so every message is written on screen.

## Scenes

| Time | Scene |
|---|---|
| 0–3.4 s | Hook: "Still chasing receipts?" |
| 3.4–7.4 s | Brand: wordmark, "One inbox for every receipt." |
| 7.2–12.8 s | Step 1, email: forward to the private `receipts+…@in.unreceipt.com` address |
| 12.6–18.8 s | Step 1, paper: photo, "Reading your receipt…", fields filled in |
| 18.6–24.6 s | Step 2: the digital receipt gets its Verified stamp |
| 24.2–30.0 s | Step 3: the inbox and the ZIP export |
| 29.9–40 s | End card: summary receipt, "Stop chasing receipts.", Join the pilot |

## Preview

Open `explainer.html` in a browser. Space plays and pauses, the arrow keys step one frame, and the menu switches between 16:9 and 4:5. `?t=21.5` opens on one frame and `?format=portrait` opens the 4:5 version.

## Render

```sh
npm ci
npx playwright install chromium                                 # once
node marketing/explainer-video/render.mjs                       # both formats
node marketing/explainer-video/render.mjs --format portrait     # one format
node marketing/explainer-video/render.mjs --stills 2.4,21.6     # PNG stills only
```

You need ffmpeg (`brew install ffmpeg`) and an internet connection: the fonts come from Google Fonts. The script stops rather than render with fallback fonts. Output goes to `out/`, which git ignores.

## Changing it

- **Words:** all of the text is in the `COPY` object at the top of the script. To add a language, add a new key and pass `--lang`.
- **Timing:** each scene has its own function (`scene1` … `scene7`), with times in seconds.
- **Claims:** every claim must match the landing copy (`src/app/_landing-copy.ts`) and what the product actually does. Re-render the video when either changes. When the pilot ends, change `s7.sub` and `s7.cta` (the landing page switches to "Start your free week").
- **Examples:** the receipts are Swedish and in kronor, like the English landing page. The VAT example is office supplies at 25 % on purpose. Swedish food VAT is 6 % from 1 April 2026 to 31 December 2027 (eating in at a restaurant stays at 12 %), so don't show a food receipt with a fixed rate.
- **Design:** colours, fonts and the UI follow `DESIGN.md`: Geist Mono only for amounts, and the wordmark and receipt motifs taken from the real components.
