import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import * as pageStaticInfo from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";

import { config, hasBackslash, proxy } from "../proxy";

// On Vercel, `/demo%5C` made the server look for a page module named
// `demo%5C.js` and answer 500 MODULE_NOT_FOUND (crawler hits, 2026-11-10).

const req = (url: string) => new NextRequest(url);

describe("src/proxy — backslash paths answer 404, not a server error", () => {
  it.each([
    "https://app.unreceipt.com/demo%5C",
    "https://app.unreceipt.com/sv%5C",
    "https://app.unreceipt.com/app/login%5C",
    "https://app.unreceipt.com/privacy%5C",
    "https://unreceipt.com/privacy%5C",
    "https://app.unreceipt.com/demo%5c",
    "https://app.unreceipt.com/demo%5C/company",
    "https://app.unreceipt.com/admin%5C",
    "https://app.unreceipt.com/api/admin/firms%5C",
  ])("answers 404 for %s, with no redirect", async (url) => {
    const res = proxy(req(url));
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.text()).toBe("Not found");
  });

  it("sees the encoded backslash in the pathname (WHATWG URL keeps %5C)", () => {
    expect(req("https://app.unreceipt.com/demo%5C").nextUrl.pathname).toBe("/demo%5C");
  });

  it("recognises a decoded backslash too", () => {
    expect(hasBackslash("/demo\\")).toBe(true);
    expect(hasBackslash("/demo")).toBe(false);
    // Double-encoded is the literal text "%5C", not a backslash.
    expect(hasBackslash("/demo%255C")).toBe(false);
  });

  it("passes anything else through", () => {
    expect(proxy(req("https://app.unreceipt.com/demo")).status).toBe(200);
  });
});

describe("src/proxy — matcher", () => {
  // Compiled the way Next compiles it at build time. getMiddlewareMatchers is
  // exported at runtime but missing from Next's type declarations.
  const { getMiddlewareMatchers } = pageStaticInfo as unknown as {
    getMiddlewareMatchers: (
      matchers: string[],
      nextConfig: { i18n?: undefined }
    ) => Parameters<typeof getMiddlewareRouteMatcher>[0];
  };
  const match = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, { i18n: undefined }));
  const runs = (p: string) => Boolean(match(p, { headers: {} } as never, {}));

  it.each([
    "/demo%5C",
    "/demo%5c",
    "/demo\\",
    "/app/login%5C",
    "/demo%5C/company",
    "/%5C",
    "/_next/static%5C",
    "/favicon.ico%5C",
  ])("runs for %s", (p) => {
    expect(runs(p)).toBe(true);
  });

  it.each(["/", "/demo", "/app/login", "/api/receipts/updates", "/demo%255C", "/demo/caf%C3%A9", "/_next/static/chunks/main.js"])(
    "does not run for %s",
    (p) => {
      expect(runs(p)).toBe(false);
    }
  );
});

describe("proxy file placement", () => {
  it("lives next to src/app, where Next 16 looks for it", () => {
    // Next registers proxy.ts only beside the `app` directory. This app's is
    // src/app, so a repo-root proxy.ts is silently never run.
    const root = path.resolve(__dirname, "../..");
    expect(() => readFileSync(path.join(root, "src/proxy.ts"))).not.toThrow();
    expect(() => readFileSync(path.join(root, "src/app/layout.tsx"))).not.toThrow();
  });
});
