import { continueRender, delayRender, staticFile } from "remotion";

// The same font files the onboarding PDFs use (docs/onboarding/fonts),
// copied to public/fonts so rendering needs no network.
const SHEETS = ["font-manrope.css", "font-figtree.css", "font-geist_mono.css"];

let started = false;

export function loadFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Loading brand fonts");
  const loads = SHEETS.map(
    (name) =>
      new Promise<void>((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = staticFile(`fonts/${name}`);
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
      }),
  );
  Promise.all(loads)
    .then(() =>
      Promise.all([
        document.fonts.load("800 40px Manrope"),
        document.fonts.load("600 40px Manrope"),
        document.fonts.load("500 40px 'Geist Mono'"),
        document.fonts.load("500 40px Figtree"),
      ]),
    )
    .then(() => document.fonts.ready)
    .finally(() => continueRender(handle));
}
