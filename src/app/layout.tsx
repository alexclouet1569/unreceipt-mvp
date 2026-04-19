import type { Metadata } from "next";
import { Manrope, Figtree } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-accent",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "UnReceipt — Automatic Expense Receipt Capture for Businesses",
    template: "%s | UnReceipt",
  },
  description:
    "Stop losing receipts. UnReceipt captures expense receipts automatically at the moment of payment — no photos, no forms, no effort. Free for teams up to 10. Works with any corporate card.",
  metadataBase: new URL("https://unreceipt.com"),
  keywords: [
    "automatic receipt capture",
    "expense management software",
    "expense report automation",
    "digital receipt management",
    "corporate expense tracking",
    "receipt scanning app",
    "business expense software",
    "expense receipt capture",
    "automated expense reports",
    "no more lost receipts",
    "corporate card expense tracking",
    "real-time expense tracking",
    "employee expense management",
    "SME expense software",
    "gestion automatique des reçus",
    "gestion des notes de frais",
    "justificatifs de paiement automatiques",
    "logiciel notes de frais",
    "capture automatique ticket de caisse",
  ],
  authors: [{ name: "UnReceipt" }],
  creator: "UnReceipt",
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: "fr_FR",
    url: "https://unreceipt.com",
    siteName: "UnReceipt",
    title: "UnReceipt — From Chaos to Clarity, Automatically",
    description:
      "Automatic expense receipt capture for businesses. No photos, no forms — receipts appear instantly when your employees pay. Free for small teams.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "UnReceipt — Automatic expense receipt capture. From Chaos to Clarity, Automatically.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UnReceipt — From Chaos to Clarity, Automatically",
    description:
      "Stop losing receipts. Automatic expense capture at the moment of payment. Free for teams up to 10.",
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
  alternates: {
    languages: {
      "en": "https://unreceipt.com",
      "fr": "https://unreceipt.com",
      "x-default": "https://unreceipt.com",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${figtree.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#27BE7B" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="UnReceipt" />
        <link rel="apple-touch-icon" href="/icons/icon-192" />
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
              description:
                "Automatic expense receipt capture for businesses. Receipts are captured at the moment of payment — no photos, no forms, no effort. Works with any existing corporate card.",
              url: "https://unreceipt.com",
              offers: [
                {
                  "@type": "Offer",
                  name: "Free",
                  description: "For small teams up to 10 employees",
                  price: "0",
                  priceCurrency: "EUR",
                },
                {
                  "@type": "Offer",
                  name: "Pro",
                  description: "For growing companies — unlimited employees, approval workflows, integrations",
                  price: "9",
                  priceCurrency: "EUR",
                  unitText: "per user per month",
                },
                {
                  "@type": "Offer",
                  name: "Enterprise",
                  description: "For large organizations — SSO, multi-entity, dedicated support",
                  price: "0",
                  priceCurrency: "EUR",
                  priceSpecification: {
                    "@type": "PriceSpecification",
                    priceCurrency: "EUR",
                    eligibleQuantity: {
                      "@type": "QuantitativeValue",
                      unitText: "custom pricing",
                    },
                  },
                },
              ],
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
