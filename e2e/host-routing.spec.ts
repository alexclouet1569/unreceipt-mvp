import { expect, test } from "@playwright/test";

/**
 * Host-routing live smoke test. Production-only: the apex/app split
 * is enforced by `proxy.ts` based on the `host` header, and Vercel
 * deploys both hosts to the same project. Local dev sees both
 * surfaces on a single origin so this test would always be skipped
 * there.
 *
 * Run against production with:
 *
 *   PLAYWRIGHT_HOST_ROUTING=1 \
 *   PLAYWRIGHT_BASE_URL=https://unreceipt.com \
 *   bun test:e2e --grep "host routing"
 *
 * Otherwise skipped — proxy.test.ts covers the routing decisions in
 * isolation.
 */
const enabled = process.env.PLAYWRIGHT_HOST_ROUTING === "1";

test.describe("host routing — apex ↔ app split", () => {
  test.skip(
    !enabled,
    "PLAYWRIGHT_HOST_ROUTING not set — host-routing smoke skipped"
  );

  test("unreceipt.com/app/login → 308 → app.unreceipt.com/app/login", async ({
    request,
  }) => {
    const res = await request.get("https://unreceipt.com/app/login", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(
      "https://app.unreceipt.com/app/login"
    );
  });

  test("app.unreceipt.com/ → 308 → unreceipt.com/", async ({ request }) => {
    const res = await request.get("https://app.unreceipt.com/", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe("https://unreceipt.com/");
  });

  test("apex landing HTML does NOT include the manifest link", async ({
    page,
  }) => {
    await page.goto("https://unreceipt.com/");
    const html = await page.content();
    expect(html).not.toMatch(/<link\s+rel="manifest"/i);
  });

  test("app login HTML includes the manifest link", async ({ page }) => {
    await page.goto("https://app.unreceipt.com/app/login");
    const html = await page.content();
    expect(html).toMatch(/<link\s+rel="manifest"/i);
  });

  test("manifest.json is reachable on the app host", async ({ request }) => {
    const res = await request.get("https://app.unreceipt.com/manifest.json");
    expect(res.status()).toBe(200);
  });
});
