// @vitest-environment node

import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function headersFor(path: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === "/:path*");
  expect(rule, `no catch-all header rule for ${path}`).toBeDefined();
  return Object.fromEntries(rule!.headers.map((h) => [h.key, h.value]));
}

describe("security headers (next.config.ts)", () => {
  it("forbids framing, sniffing and leaky referrers on every route", async () => {
    const h = await headersFor("/app");

    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });

  it("allows the camera for capture and nothing else sensitive", async () => {
    const h = await headersFor("/app");

    expect(h["Permissions-Policy"]).toContain("camera=(self)");
    expect(h["Permissions-Policy"]).toContain("microphone=()");
    expect(h["Permissions-Policy"]).toContain("geolocation=()");
  });

  it("keeps the strict CSP in report-only and allows Supabase originals", async () => {
    const h = await headersFor("/app");

    expect(h["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
    expect(h["Content-Security-Policy-Report-Only"]).toContain(
      "frame-src 'self' https://*.supabase.co"
    );
  });
});
