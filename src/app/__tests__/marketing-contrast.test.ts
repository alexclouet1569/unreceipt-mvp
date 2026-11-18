import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// White text on the brand green #27BE7B is 2.4:1 and fails WCAG AA
// (DESIGN.md: "Never under white text"). On the marketing site a green fill
// carries a navy label (#303568 or #0F1124), and a white label sits on the
// action green #1A7F52. This guards the class strings; a hero section is
// several elements and is checked by eye (DESIGN.md decision log 2026-11-18).

const APP = join(process.cwd(), "src/app");
const FILES = [
  ...readdirSync(APP)
    .filter((f) => f.startsWith("_") && f.endsWith(".tsx"))
    .map((f) => join(APP, f)),
  join(APP, "privacy/page.tsx"),
];

/** Every quoted or template string in the file. */
function strings(source: string): string[] {
  return [...source.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
}

function tokens(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

describe("marketing contrast", () => {
  it("never puts white text on a #27BE7B fill", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const s of strings(readFileSync(file, "utf8"))) {
        const t = tokens(s);
        const greenFill = t.some((x) => x.toLowerCase() === "bg-[#27be7b]");
        const whiteText = t.some((x) => x === "text-white" || x.startsWith("text-white/"));
        if (greenFill && whiteText) offenders.push(`${file}: ${s}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never puts white text on the #1F9D63 hover green either", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const s of strings(readFileSync(file, "utf8"))) {
        const t = tokens(s);
        if (t.includes("hover:bg-[#1F9D63]") && t.includes("text-white")) offenders.push(`${file}: ${s}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
