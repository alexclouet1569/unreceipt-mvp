// `npm run ios:sync`: copies the web assets and plugins into ios/ (npx cap
// sync ios), after writing native/www/start-url.js so the offline screen's
// "Try again" returns to the same server the app was built for
// (CAP_SERVER_URL for development, production otherwise).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const origin = (process.env.CAP_SERVER_URL || "https://app.unreceipt.com").replace(/\/+$/, "");
const startUrl = `${origin}/app`;
if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d+)?$/i.test(origin)) {
  console.error(`CAP_SERVER_URL must be https://… or http://localhost:<port>, got ${origin}`);
  process.exit(1);
}
writeFileSync(
  new URL("../native/www/start-url.js", import.meta.url),
  `window.UNRECEIPT_START_URL = ${JSON.stringify(startUrl)};\n`,
);
if (origin !== "https://app.unreceipt.com") {
  console.warn(`\n⚠ This build opens ${startUrl}. Run without CAP_SERVER_URL before archiving for TestFlight.\n`);
}
execFileSync("npx", ["cap", "sync", "ios"], { stdio: "inherit" });
