// Renders one PNG per scene for the storyboard: node scripts/stills.mjs [composition] [frames...]
import { execFileSync } from "node:child_process";

const comp = process.argv[2] ?? "Ad30-9x16";
const frames = process.argv.slice(3).length ? process.argv.slice(3) : ["70", "290", "500", "640", "860"];
for (const f of frames) {
  execFileSync(
    "npx",
    ["remotion", "still", "src/index.ts", comp, `out/stills/${comp}-${f}.png`, `--frame=${f}`],
    { stdio: "inherit" },
  );
}
