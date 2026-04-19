import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "UnReceipt — Paper is Past",
    template: "%s | UnReceipt",
  },
  description:
    "Automatic expense receipt capture for businesses. Your employees will never lose a receipt again. Works with your existing corporate cards.",
  metadataBase: new URL("https://unreceipt.com"),
  keywords: [
    "expense management",
    "receipt capture",
    "expense report",
    "corporate expenses",
    "receipt scanning",
    "business expenses",
    "expense tracking",
    "digital receipts",
    "expense automation",
    "gestion des notes de frais",
    "justificatifs de paiement",
  ],
  authors: [{ name: "UnReceipt" }],
  creator: "UnReceipt",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://unreceipt.com",
    siteName: "UnReceipt",
    title: "UnReceipt — Paper is Past",
    description:
      "Automatic expense receipt capture for businesses. Works with your existing corporate cards — no migration needed.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "UnReceipt — The cleanest way to track spending",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UnReceipt — Paper is Past",
    description:
      "Automatic expense receipt capture for businesses. Works with your existing corporate cards.",
    images: ["/og-image.png"],
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#57B882" />
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
                "Automatic expense receipt capture for businesses. Works with your existing corporate cards.",
              url: "https://unreceipt.com",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "6",
                highPrice: "12",
                priceCurrency: "EUR",
                offerCount: "3",
              },
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
