// Renders mobile/assets/splash-icon.png (the rounded brand icon on a transparent
// background, shown centred on cream by expo-splash-screen) from the brand mark,
// same geometry as native/assets/render-icons.mjs. The app icon is
// native/assets/app-icon-1024.png, copied to mobile/assets/icon.png.
//   node mobile/scripts/render-assets.mjs   (from the repository root, after npm ci)
import { chromium } from 'playwright';
import sharp from 'sharp';
const GLYPH = `
  <path d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z" fill="#FAFAF7"/>
  <rect x="36" y="22" width="14" height="2.6" rx="1.3" fill="#27BE7B"/>
  <rect x="33" y="29" width="20" height="2.6" rx="1.3" fill="#27BE7B"/>
  <rect x="33" y="36" width="17" height="2.6" rx="1.3" fill="#27BE7B"/>
  <rect x="33" y="43" width="14" height="2.6" rx="1.3" fill="#27BE7B"/>
  <path d="M30 26 A12 12 0 1 1 23 11" stroke="#27BE7B" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M19.5 11 L25.5 7.5 L25.5 14.5 Z" fill="#27BE7B"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#303568"/>
  <g transform="translate(19 19) scale(0.96875)">${GLYPH}</g></svg>`;
// CHROMIUM_PATH: an already-installed Chromium instead of Playwright's own.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
const raw = await page.screenshot({ omitBackground: true });
await sharp(raw).png().toFile(new URL('../assets/splash-icon.png', import.meta.url).pathname);
await browser.close();
