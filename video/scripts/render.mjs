// Renders every composition (or the ones named): node scripts/render.mjs [ids...]
import { execFileSync } from "node:child_process";

const all = ["Ad30-9x16", "Ad30-1x1", "Ad30-16x9", "Ad15-9x16", "Ad15-1x1", "Ad15-16x9"];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;
for (const id of ids) {
  execFileSync("npx", ["remotion", "render", "src/index.ts", id, `out/UnReceipt-${id}.mp4`], { stdio: "inherit" });
}
