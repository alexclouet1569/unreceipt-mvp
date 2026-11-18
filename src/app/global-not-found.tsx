import type { Metadata } from "next";
import Link from "next/link";
import { MarketingDocument } from "./_root-document";

// An address that matches no route. The site has several root layouts
// (src/app/_root-document.tsx), so this page brings its own document.
// `notFound()` inside a route still renders that route's not-found UI.

export const metadata: Metadata = {
  title: "Page not found | UnReceipt",
  robots: { index: false, follow: true },
};

export default function GlobalNotFound() {
  return (
    <MarketingDocument lang="en">
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <h1 className="text-3xl font-extrabold text-[#303568]">Page not found</h1>
        <p className="text-[#303568]/70">This page doesn&apos;t exist, or it has moved.</p>
        <Link href="/" className="font-semibold text-[#1F9D63] underline underline-offset-4">
          Go to the homepage
        </Link>
      </main>
    </MarketingDocument>
  );
}
