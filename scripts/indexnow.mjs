// Submit every URL in the live sitemap to IndexNow (Bing, Yandex, Seznam,
// Naver), so new and changed marketing pages are recrawled within hours.
// Bing's index feeds ChatGPT search and Copilot.
//
// Run after a production deploy that changed marketing pages:
//   node scripts/indexnow.mjs
// Optional: node scripts/indexnow.mjs https://unreceipt.com/accountants ...
// to submit only some URLs.
//
// The key must match src/lib/indexnow.ts and public/<key>.txt.

import { readFileSync } from "node:fs";

const SITE = "https://unreceipt.com";
const key = readFileSync(new URL("../src/lib/indexnow.ts", import.meta.url), "utf8").match(
  /INDEXNOW_KEY = "([0-9a-f]{32})"/
)?.[1];
if (!key) throw new Error("INDEXNOW_KEY not found in src/lib/indexnow.ts");

let urls = process.argv.slice(2);
if (urls.length === 0) {
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
urls = urls.filter((u) => u.startsWith(`${SITE}/`) || u === SITE);
if (urls.length === 0) throw new Error("No unreceipt.com URLs to submit");

// The key file must be live before engines accept the ping.
const keyRes = await fetch(`${SITE}/${key}.txt`);
if (!keyRes.ok || (await keyRes.text()).trim() !== key) {
  throw new Error(`${SITE}/${key}.txt is not live yet; deploy first.`);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: "unreceipt.com",
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList: urls,
  }),
});
// 200 = accepted, 202 = accepted, key check pending.
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urls.length} URLs`);
if (res.status >= 300) {
  console.error(await res.text());
  process.exit(1);
}
