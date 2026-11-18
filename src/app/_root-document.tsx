import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope, Figtree, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DESCRIPTION, SHARE_DESCRIPTION, SITE_URL, TITLE, OG_IMAGE } from "@/lib/seo";
import type { Locale } from "@/lib/locale";
import "./globals.css";
import { NativeAppBridge } from "./_native-app-bridge";
import { VercelAnalytics } from "./_vercel-analytics";
import { FunnelTracking } from "./_funnel-tracking";

/**
 * The `<html>` documents of the site. There is no `src/app/layout.tsx`:
 * every part of the site has its own root layout (Next's "multiple root
 * layouts"), so the server HTML carries the right `lang` and the marketing
 * pages can be prerendered.
 *
 * - Marketing (`(en)/layout.tsx`, `sv/layout.tsx`, `fr/layout.tsx`):
 *   `MarketingDocument`, static, always light, no PWA assets.
 * - Product (`app/`, `admin/`, `firm/`, `demo/`, `subscribe/` layouts):
 *   `ProductDocument`, which reads the host for the PWA assets and dark mode.
 *
 * Moving between two root layouts is a full page load, as it always is
 * between the two hosts in production. A new top-level page folder needs a
 * root layout (English marketing pages go inside `(en)/`); a test checks it.
 */

const APP_HOST = "app.unreceipt.com";

// Manrope — primary face per brand book pp. 15–16. Body, headings, and
// app titles all resolve to Manrope. Exposed as `--font-sans` (the default
// Tailwind `font-sans` utility) so plain text reads as Manrope everywhere.
// `--font-display` in globals.css aliases this so the `font-display`
// utility on existing headings keeps resolving to Manrope.
const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Figtree — italic accent face per brand book p. 16. Reserved for short
// punchy callouts, pull quotes, and brief descriptive notes via the
// `font-accent italic` utility pair. Never the body default.
const figtree = Figtree({
  variable: "--font-accent",
  subsets: ["latin"],
});

// Geist Mono — monetary amounts only (DESIGN.md typography spec).
// Wired as `--font-mono` so the Tailwind `font-mono` utility resolves to
// Geist Mono. Never use this face for body or labels.
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const HTML_CLASS = `${manrope.variable} ${figtree.variable} ${geistMono.variable} h-full antialiased`;
const BODY_CLASS = "min-h-full flex flex-col font-sans";

/** Site-wide defaults; every root layout exports these (pages override). */
export const ROOT_METADATA: Metadata = {
  title: {
    default: TITLE,
    template: "%s | UnReceipt",
  },
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  keywords: [
    "receipt management",
    "receipt app for small business",
    "receipt software for accountants",
    "VAT receipts",
    "receipt scanning app",
    "kvittohantering",
    "gestion des justificatifs",
  ],
  authors: [{ name: "UnReceipt" }],
  creator: "UnReceipt",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://unreceipt.com",
    siteName: "UnReceipt",
    title: "UnReceipt — From Chaos to Clarity",
    description: SHARE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "UnReceipt — From Chaos to Clarity",
    description: SHARE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "I0W0EWJsx8I_dsGCC1X-c83uyriE23dm6mhxvafxGXQ",
  },
};

/**
 * A marketing page's document. Reads nothing from the request, so the pages
 * under it are prerendered at build time. The marketing site has no dark
 * design (DESIGN.md "Dark mode"), so no `data-theme` is ever set here.
 */
export function MarketingDocument({ lang, children }: { lang: Locale; children: React.ReactNode }) {
  return (
    <html lang={lang} className={HTML_CLASS}>
      <head>
        <meta name="theme-color" content="#27BE7B" />
      </head>
      <body className={BODY_CLASS}>
        {children}
        <VercelAnalytics />
        {/* Funnel links; Plausible only where src/lib/tracking/where.ts allows. */}
        <FunnelTracking plausibleDomain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim() || null} />
      </body>
    </html>
  );
}

/** The product's document (English only, see AGENTS.md "Languages"). */
export async function ProductDocument({ children }: { children: React.ReactNode }) {
  // PWA assets (manifest, apple-touch-icon, mobile-web-app meta) only
  // ship on the product host. Localhost / Vercel previews see them too so
  // dev still works. Product pages render per request anyway.
  const headerList = await headers();
  const host = (headerList.get("host") ?? "").toLowerCase();
  const isAppHost =
    host === APP_HOST ||
    host.startsWith("localhost") ||
    host.endsWith(".vercel.app") ||
    host.startsWith("127.0.0.1");

  return (
    // data-theme="auto": the product follows the device's light or dark
    // setting (globals.css).
    <html
      lang="en"
      data-theme={isAppHost ? "auto" : undefined}
      suppressHydrationWarning
      className={HTML_CLASS}
    >
      <head>
        {isAppHost ? (
          <>
            <link rel="manifest" href="/manifest.json" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <meta name="apple-mobile-web-app-title" content="UnReceipt" />
            <link rel="apple-touch-icon" href="/icons/apple-touch-icon" />
          </>
        ) : null}
        <meta name="theme-color" content="#27BE7B" />
        {isAppHost ? <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0F1124" /> : null}
      </head>
      <body className={BODY_CLASS}>
        <TooltipProvider>{children}</TooltipProvider>
        <NativeAppBridge />
        <VercelAnalytics />
        {/* Funnel links everywhere; Plausible only where src/lib/tracking/where.ts allows. */}
        <FunnelTracking plausibleDomain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim() || null} />
      </body>
    </html>
  );
}
