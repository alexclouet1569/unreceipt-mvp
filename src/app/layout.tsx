import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope, Figtree, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DESCRIPTION, SHARE_DESCRIPTION, SITE_URL, TITLE } from "@/lib/seo";
import { MARKETING_PATHS } from "@/lib/marketing-pages";
import "./globals.css";
import { NativeAppBridge } from "./_native-app-bridge";

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

export const metadata: Metadata = {
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
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "UnReceipt — VAT-ready receipts for small businesses and their accountants.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UnReceipt — From Chaos to Clarity",
    description: SHARE_DESCRIPTION,
    images: ["/opengraph-image"],
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

/** Marketing paths, which stay light (DESIGN.md "Dark mode"). */
const LIGHT_PATHS = [...MARKETING_PATHS, "/privacy"];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // PWA assets (manifest, apple-touch-icon, mobile-web-app meta) only
  // ship on the product host. The marketing apex stays a pure website
  // — no install prompts, no service-worker scope, browsers won't
  // suggest "Add to Home Screen" from there. Localhost / Vercel
  // previews see the PWA assets too so dev still works.
  const headerList = await headers();
  const host = (headerList.get("host") ?? "").toLowerCase();
  // Hosts that serve the product and the marketing site from one origin.
  const sharedHost = host.startsWith("localhost") || host.endsWith(".vercel.app") || host.startsWith("127.0.0.1");
  const isAppHost =
    host === APP_HOST ||
    host.startsWith("localhost") ||
    host.endsWith(".vercel.app") ||
    host.startsWith("127.0.0.1");

  return (
    // data-theme="auto": the product follows the device's light or dark
    // setting (globals.css). The marketing apex stays light; local and
    // preview addresses serve both surfaces, so there both follow it.
    <html
      lang="en"
      data-theme={isAppHost ? "auto" : undefined}
      data-theme-default={isAppHost ? "auto" : undefined}
      // A marketing page on a shared (local / preview) host removes it before paint.
      suppressHydrationWarning
      className={`${manrope.variable} ${figtree.variable} ${geistMono.variable} h-full antialiased`}
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
        {sharedHost ? (
          // Local and preview addresses serve the marketing site too, which
          // has no dark design: drop the dark-mode mark before the first
          // paint on its paths (LightOnly covers client navigations).
          <script
            dangerouslySetInnerHTML={{
              __html: `if(${JSON.stringify(LIGHT_PATHS)}.indexOf(location.pathname)>-1)document.documentElement.removeAttribute("data-theme")`,
            }}
          />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
        <NativeAppBridge />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
