/**
 * IndexNow (indexnow.org): tells Bing (and Yandex, Seznam, Naver) the
 * moment a page changes, instead of waiting for a crawl. Bing's index is
 * what ChatGPT search and Microsoft Copilot read, so this is the fastest
 * way for a new or edited page to reach AI answers.
 *
 * The key is public by design: search engines fetch
 * https://unreceipt.com/<key>.txt to check that the site owner sent the
 * ping. Its file lives in public/. Submit with `node scripts/indexnow.mjs`
 * after a deploy that changes marketing pages.
 */
export const INDEXNOW_KEY = "44a17b511474c8672efec1f1ee73cf60";
