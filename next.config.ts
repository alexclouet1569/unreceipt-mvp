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
const nextConfig: NextConfig = {
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
