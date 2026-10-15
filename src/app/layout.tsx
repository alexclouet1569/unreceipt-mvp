import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope, Figtree, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PLANS } from "@/lib/plans";
import "./globals.css";

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

// Every claim here must match what the product does today: a private
// forwarding address, photo capture with auto-fill, and concierge-checked,
// VAT-ready records within 24 hours. Prices mirror src/app/_pricing.tsx.
const DESCRIPTION =
  "Forward email receipts or snap paper ones. UnReceipt turns every receipt into a VAT-ready record within 24 hours — merchant, line items, VAT and category. Built for small businesses in Sweden. Plans from €5.99/month.";
const SHARE_DESCRIPTION =
  "Forward any receipt — email or photo — and get a VAT-ready record within 24 hours. Built for small businesses in Sweden.";

export const metadata: Metadata = {
  title: {
    default: "UnReceipt — VAT-Ready Receipts for Small Businesses in Sweden",
    template: "%s | UnReceipt",
  },
  description: DESCRIPTION,
  metadataBase: new URL("https://unreceipt.com"),
  keywords: [
    "receipt management",
    "VAT receipts",
    "expense receipts small business",
    "receipt inbox",
    "receipt scanning app",
    "kvitton företag",
    "kvittohantering",
    "moms kvitto",
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
        alt: "UnReceipt — VAT-ready receipts for small businesses. From Chaos to Clarity.",
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
  const isAppHost =
    host === APP_HOST ||
    host.startsWith("localhost") ||
    host.endsWith(".vercel.app") ||
    host.startsWith("127.0.0.1");

  return (
    <html lang="en" className={`${manrope.variable} ${figtree.variable} ${geistMono.variable} h-full antialiased`}>
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
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "UnReceipt",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description: DESCRIPTION,
              url: "https://unreceipt.com",
              offers: PLANS.map((plan) => ({
                "@type": "Offer",
                name: plan.name,
                price: plan.price.toFixed(2),
                priceCurrency: "EUR",
                description: `Up to ${plan.receipts} receipts per month for the whole company`,
                unitText: "per month",
              })),
            }),
          }}
        />
        <TooltipProvider>{children}</TooltipProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
