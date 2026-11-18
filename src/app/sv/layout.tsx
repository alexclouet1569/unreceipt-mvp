import { MarketingDocument, ROOT_METADATA } from "../_root-document";

// Root layout of the Swedish marketing pages: `<html lang="sv">` is in the
// server HTML, which is what Bing and Google read.

// Prerendered at build time; reading the request here fails the build.
export const dynamic = "error";

export const metadata = ROOT_METADATA;

export default function SwedishRootLayout({ children }: { children: React.ReactNode }) {
  return <MarketingDocument lang="sv">{children}</MarketingDocument>;
}
