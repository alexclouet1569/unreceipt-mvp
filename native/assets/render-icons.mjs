// Renders the iOS app icon and splash from the brand mark (same geometry as
// src/app/icon2.svg and src/app/icons/_isotype.tsx) and writes them into the
// Xcode asset catalog. Re-run after a brand change:
//   node native/assets/render-icons.mjs
// Needs Playwright's Chromium (or CHROMIUM_PATH) and sharp (in node_modules).
// App Store Connect rejects an icon with an alpha channel, so sharp drops it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', '..', 'ios', 'App', 'App', 'Assets.xcassets');
const OUT = {
  icon: [path.join(__dirname, 'app-icon-1024.png'), path.join(ASSETS, 'AppIcon.appiconset', 'AppIcon-512@2x.png')],
  splash: [
    path.join(__dirname, 'splash-2732.png'),
    ...['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((f) =>
      path.join(ASSETS, 'Splash.imageset', f),
    ),
  ],
};
const GLYPH = `
  <path d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z" fill="#FAFAF7"/>
  <rect x="36" y="22" width="14" height="2.6" rx="1.3" fill="#27BE7B"/>
  <rect x="33" y="29" width="20" height="2.6" rx="1.3" fill="#27BE7B"/>
  <rect x="33" y="36" width="17" height="2.6" rx="1.3" fill="#27BE7B"/>
  <rect x="33" y="43" width="14" height="2.6" rx="1.3" fill="#27BE7B"/>
  <path d="M30 26 A12 12 0 1 1 23 11" stroke="#27BE7B" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M19.5 11 L25.5 7.5 L25.5 14.5 Z" fill="#27BE7B"/>`;
// App icon: full-bleed navy square (iOS applies its own corner mask), glyph at
// the same 62% as the PWA icon (src/app/icons/_isotype.tsx).
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#303568"/>
  <g transform="translate(19 19) scale(0.96875)">${GLYPH}</g></svg>`;
// Splash: cream (--surface) with the rounded brand icon in the middle. iOS
// aspect-fills the square, so only the centre is ever visible.
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#FAFAF7"/>
  <svg x="1166" y="1166" width="400" height="400" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="22" fill="#303568"/>
    <g transform="translate(19 19) scale(0.96875)">${GLYPH}</g>
  </svg></svg>`;
await (async () => {
  // CHROMIUM_PATH: use an already-installed Chromium instead of Playwright's
  // (otherwise run `npx playwright install chromium` once).
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  for (const [name, svg, size] of [['icon', icon, 1024], ['splash', splash, 2732]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const raw = await page.screenshot({ omitBackground: false });
    await page.close();
    const png = await sharp(raw).removeAlpha().png().toBuffer();
    for (const out of OUT[name]) await sharp(png).toFile(out);
    console.log(`${name}: ${size}×${size} → ${OUT[name].length} files`);
  }
  await browser.close();
})();
