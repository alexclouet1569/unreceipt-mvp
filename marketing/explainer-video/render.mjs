// Renders explainer.html into MP4 videos: Playwright seeks the animation
// frame by frame and ffmpeg encodes the screenshots (H.264, yuv420p).
//
//   node marketing/explainer-video/render.mjs                 both formats, en
//   node marketing/explainer-video/render.mjs --format portrait --lang en
//   node marketing/explainer-video/render.mjs --stills 2,6,21.6   PNG stills only
//
// Needs ffmpeg on PATH and the Playwright Chromium that ships with the e2e
// tests (`npx playwright install chromium`); EXPLAINER_CHROMIUM overrides it.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIZES = { landscape: [1920, 1080], portrait: [1080, 1350] };

function parseArgs(argv) {
  const out = { format: "all", lang: "en", fps: 30, stills: null, out: path.join(here, "out") };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    if (!(key in out)) throw new Error(`Unknown option --${key}`);
    out[key] = argv[i + 1];
  }
  out.fps = Number(out.fps);
  return out;
}

function encoder(file, fps) {
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  const write = (buf) => new Promise((resolve) => (ff.stdin.write(buf) ? resolve() : ff.stdin.once("drain", resolve)));
  return { write, end: () => { ff.stdin.end(); return done; } };
}

async function openPage(browser, format, lang) {
  const [width, height] = SIZES[format];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const url = pathToFileURL(path.join(here, "explainer.html"));
  url.search = new URLSearchParams({ format, lang, render: "1" }).toString();
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.evaluate(() => window.ready);
  const missing = await page.evaluate(() =>
    ['800 40px "Manrope"', '600 40px "Manrope"', 'italic 500 20px "Figtree"', '500 20px "Geist Mono"', '600 20px "Geist Mono"']
      .filter((font) => !document.fonts.check(font))
  );
  if (missing.length) throw new Error(`Fonts did not load (offline?): ${missing.join(", ")}`);
  return page;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const formats = args.format === "all" ? Object.keys(SIZES) : [args.format];
  for (const f of formats) if (!SIZES[f]) throw new Error(`Unknown format ${f}`);
  await mkdir(args.out, { recursive: true });

  const browser = await chromium.launch(
    process.env.EXPLAINER_CHROMIUM ? { executablePath: process.env.EXPLAINER_CHROMIUM } : {}
  );
  try {
    for (const format of formats) {
      const page = await openPage(browser, format, args.lang);
      const base = `unreceipt-explainer-${args.lang}-${format}`;

      if (args.stills) {
        for (const t of args.stills.split(",").map(Number)) {
          await page.evaluate((s) => window.seek(s), t);
          await writeFile(path.join(args.out, `${base}-${t.toFixed(2)}s.png`), await page.screenshot({ type: "png" }));
        }
        await page.close();
        continue;
      }

      const duration = await page.evaluate(() => window.DURATION);
      const frames = Math.round(duration * args.fps);
      const video = encoder(path.join(args.out, `${base}.mp4`), args.fps);
      const started = Date.now();
      for (let i = 0; i < frames; i++) {
        await page.evaluate((s) => window.seek(s), i / args.fps);
        await video.write(await page.screenshot({ type: "png" }));
        if (i % (args.fps * 5) === 0) process.stdout.write(`\r${base}: ${Math.round((100 * i) / frames)}%`);
      }
      await video.end();

      // Poster for <video poster> and a LinkedIn thumbnail: the hook, fully in.
      await page.evaluate(() => window.seek(2.4));
      await writeFile(path.join(args.out, `${base}-poster.png`), await page.screenshot({ type: "png" }));
      process.stdout.write(`\r${base}: done in ${Math.round((Date.now() - started) / 1000)} s\n`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
