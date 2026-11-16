// Re-takes the guides' screenshots from the public demo tours (/demo/accountant
// and /demo/company), which show the real screens with sample data and never
// call the database. Run a local server first (see ../README.md), then:
//
//   node docs/onboarding/scripts/capture.mjs [http://localhost:3000]
//
// Writes docs/onboarding/img/*.png at 2x. Crops are found from what's on the
// page (headings, dialogs), so small layout changes don't need new numbers.

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:3000";
const IMG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "img");
const ORG = "11111111-1111-4111-8111-000000000001"; // Hallonbergen Bygg AB in the demo
const CLIENT = `/demo/accountant?step=1&view=client&org=${ORG}&month=2026-11`;

// Removes the dev-mode badge and the demo's tour bar from the page.
const tidy = () => {
  document.querySelectorAll("nextjs-portal").forEach((e) => e.remove());
  const label = [...document.querySelectorAll("body *")].find(
    (e) => e.children.length === 0 && /^demo\s*·\s*step/i.test(e.textContent.trim())
  );
  if (!label) return;
  let bar = label;
  while (bar.parentElement && bar.parentElement !== document.body && bar.parentElement.getBoundingClientRect().height < 400) {
    bar = bar.parentElement;
  }
  bar.style.display = "none";
};

// The bordered card (rounded, 1px border) around the element whose text starts with `text`.
async function cardBox(page, text) {
  return page.evaluate((text) => {
    const el = [...document.querySelectorAll("body *")].find(
      (e) => e.children.length <= 3 && e.offsetParent && e.textContent.trim().startsWith(text)
    );
    let n = el;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if (parseFloat(s.borderTopWidth) >= 1 && parseFloat(s.borderRadius) >= 6 && n.getBoundingClientRect().width > 300) break;
      n = n.parentElement;
    }
    if (!n || n === document.body) throw new Error(`No card around "${text}"`);
    const r = n.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  }, text);
}

async function shootCard(page, text, file, { pad = 10, from, height } = {}) {
  const box = await cardBox(page, text);
  const top = from ? (await cardBox(page, from)).y : box.y;
  const clip = {
    x: box.x - pad,
    y: top - pad,
    width: box.width + 2 * pad,
    height: (height ?? box.y + box.height - top) + 2 * pad,
  };
  await page.screenshot({ path: path.join(IMG, file), fullPage: true, clip });
}

// PW_CHROMIUM: a Chrome/Chromium binary to use when the project's Playwright
// version has no browser downloaded (npx playwright install also works).
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
try {
  // Accountant side, desktop.
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  const go = async (url) => {
    await desk.goto(BASE + url, { waitUntil: "networkidle" });
    await desk.waitForTimeout(500);
    await desk.evaluate(tidy);
  };

  await go("/demo/accountant?step=1");
  // The page heading and the client table together.
  const heading = await desk.getByRole("heading", { name: "Clients" }).boundingBox();
  const table = await cardBox(desk, "Last receipt");
  await desk.screenshot({
    path: path.join(IMG, "a-clients.png"),
    fullPage: true,
    clip: { x: table.x - 16, y: heading.y - 16, width: table.width + 32, height: table.y + table.height - heading.y + 32 },
  });
  await shootCard(desk, "Put it on your website", "a-firmlink.png");
  await desk.getByRole("button", { name: "Add client" }).click();
  await desk.waitForTimeout(400);
  // The inline form isn't a bordered card: crop to the element that holds its heading and fields.
  const addForm = desk.locator("form, section, div", { has: desk.getByText("Add a client company") })
    .filter({ has: desk.getByRole("button", { name: "Send invite" }) })
    .last();
  await addForm.screenshot({ path: path.join(IMG, "a-addclient.png") });

  await go(CLIENT);
  await shootCard(desk, "Weekly reminder", "a-client-head.png");
  // The bank panel down to its missing payments (the folded lists below are left out).
  await shootCard(desk, "Bank statement", "a-bank.png", { height: 465 });
  await desk.getByText("Unknown merchant").first().click();
  const sheet = desk.locator("[role=dialog]").first();
  await sheet.waitFor();
  await desk.waitForTimeout(500);
  const s = await sheet.boundingBox();
  // The digital receipt and the start of the review form.
  await desk.screenshot({ path: path.join(IMG, "a-sheet-top.png"), clip: { x: s.x, y: s.y, width: s.width, height: Math.min(s.height, 645) } });

  await go("/demo/accountant?step=1&view=settings");
  // From the firm's name down to the "Add" row of People in the firm.
  const firmName = await desk.getByRole("heading", { name: "Bergström Redovisning AB" }).boundingBox();
  const addRow = await desk.getByRole("button", { name: "Add", exact: true }).boundingBox();
  await desk.screenshot({
    path: path.join(IMG, "a-settings.png"),
    fullPage: true,
    clip: { x: firmName.x - 16, y: firmName.y - 16, width: 700, height: addRow.y + addRow.height - firmName.y + 32 },
  });

  // Client side, phone.
  const phone = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  ).newPage();
  const gm = async (url) => {
    await phone.goto(BASE + url, { waitUntil: "networkidle" });
    await phone.waitForTimeout(500);
    await phone.evaluate(tidy);
  };
  await gm("/demo/company?step=4");
  await phone.screenshot({ path: path.join(IMG, "c-connect.png"), clip: { x: 0, y: 0, width: 390, height: 330 } });
  await gm("/demo/company?step=2");
  await phone.getByRole("button", { name: "Capture receipt" }).click();
  await phone.waitForTimeout(900);
  await phone.locator("[role=dialog]").first().screenshot({ path: path.join(IMG, "c-capture.png") });
  await gm("/demo/company?step=1");
  await phone.locator("text=Uber >> visible=true").first().click();
  await phone.waitForTimeout(900);
  await phone.locator("[role=dialog]").first().screenshot({ path: path.join(IMG, "c-receipt.png") });

  console.log(`screenshots written to ${path.relative(process.cwd(), IMG)}`);
} finally {
  await browser.close();
}
