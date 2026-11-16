// Renders the onboarding guides to PDF (A4) with the pre-installed Playwright.
//
//   node docs/onboarding/scripts/render.mjs            # both guides
//   node docs/onboarding/scripts/render.mjs client     # one guide
//
// Writes the PDFs next to the HTML, and fails when a page's content runs
// into its footer (each <section class="page"> is one fixed A4 page, so
// text that doesn't fit is cut off rather than flowing to a new page).

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUIDES = {
  accountant: "UnReceipt-Guide-for-accounting-firms.pdf",
  client: "UnReceipt-Guide-for-clients.pdf",
  "quickstart-firm": "UnReceipt-Get-started-accounting-firms.pdf",
  "quickstart-company": "UnReceipt-Get-started-companies.pdf",
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(GUIDES);

// PW_CHROMIUM: a Chrome/Chromium binary to use when the project's Playwright
// version has no browser downloaded (npx playwright install also works).
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
let failed = false;
try {
  for (const name of names) {
    if (!GUIDES[name]) throw new Error(`Unknown guide "${name}" (accountant, client, quickstart-firm or quickstart-company)`);
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.goto(`file://${DIR}/${name}.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const overflows = await page.evaluate(() =>
      [...document.querySelectorAll("section.page")].flatMap((s, i) => {
        const top = s.getBoundingClientRect().top;
        const limitEl = s.querySelector(".foot, .band");
        const limit = limitEl ? limitEl.getBoundingClientRect().top - top : s.clientHeight;
        const content = [...s.children].filter((c) => !c.matches(".foot, .band"));
        const bottom = Math.max(...content.map((c) => c.getBoundingClientRect().bottom - top));
        return bottom > limit ? [`page ${i + 1}: ${Math.round(bottom - limit)}px too long`] : [];
      })
    );
    if (overflows.length) {
      failed = true;
      console.error(`${name}: ${overflows.join(", ")}`);
    }

    const out = path.join(DIR, GUIDES[name]);
    await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
    console.log(`wrote ${path.relative(process.cwd(), out)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
