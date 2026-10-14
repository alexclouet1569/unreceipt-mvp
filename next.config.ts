import type { NextConfig } from "next";

// Force every request to www.unreceipt.com to bounce to the apex domain
// (unreceipt.com). This is the canonical redirect — same content, single
// host, no cookie / PKCE-verifier loss between subdomains during auth.
//
// Why a Next.js redirect (instead of Vercel-side www→apex toggle): the
// project's domain DNS is on the registrar, not on Vercel, so Vercel's
// dashboard www-redirect option isn't available for this project. A
// `redirects()` rule runs at the framework level on every request and
// works regardless of DNS host.
// Security headers for every response (launch plan action 23).
//
// The enforced CSP only carries directives that can't break a page:
// no framing (clickjacking), no <base> hijack, no plugins, forms post to
// us. The full policy ships as Report-Only until violations have been
// reviewed (reports go to the browser console; a report endpoint comes
// with Sentry) — then it moves into the enforced header.
// Allowed origins: Supabase (API, realtime, signed storage URLs for the
// photo/PDF original) and Vercel Analytics / Speed Insights.
// Checked in Chromium against /, /app/login, /privacy, /subscribe: the only
// report is zod v4 probing `Function("")` for JIT support, which it catches
// and falls back from — no 'unsafe-eval' needed.
const CSP_ENFORCED = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com",
  "frame-src 'self' https://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP_ENFORCED },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.unreceipt.com" }],
        destination: "https://unreceipt.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
